/**
 * A short-lived cache in front of the service client's reads of an
 * organization's settings tables.
 *
 * One mobile Home load used to send about 220 PostgREST calls, two thirds of
 * them the same handful of settings reads (focus areas, jobs, shifts, roles,
 * certifications) repeated by every handler in the burst. On production's
 * small Supabase instance they queued behind each other for seconds, which is
 * what made every screen slow (measured 2026-11-13: 1.2s typical and 19s p95
 * per call, while the queries themselves ran in milliseconds).
 *
 * Only GETs of the tables below are kept, for a few seconds, and identical
 * reads in flight share one request. The service role sees every row, so a
 * response never depends on who asked. Any write through this client clears
 * the whole cache, since an RPC can change these tables without naming them;
 * another instance's write shows here within the window.
 */
export const SERVICE_READ_CACHE_TTL_MS = 5_000;
const MAX_ENTRIES = 500;

export const SERVICE_READ_CACHED_TABLES: ReadonlySet<string> = new Set([
  "absence_types",
  "certifications",
  "coverage_requirements",
  "departments",
  "focus_areas",
  "indicator_types",
  "jobs",
  "organization_roles",
  "shift_categories",
]);

type Snapshot = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

type Fetch = typeof fetch;

function requestUrl(input: Parameters<Fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: Parameters<Fetch>[0], init?: RequestInit): string {
  const method =
    init?.method ?? (typeof input === "object" && "method" in input ? input.method : undefined);
  return (method ?? "GET").toUpperCase();
}

function headerValue(
  input: Parameters<Fetch>[0],
  init: RequestInit | undefined,
  name: string,
): string {
  const source =
    init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined);
  if (!source) return "";
  return new Headers(source).get(name) ?? "";
}

/** The cached table a REST read names, or null when the read isn't cacheable. */
export function cachedTableFor(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = /\/rest\/v1\/([a-z_]+)$/.exec(path);
  if (!match) return null;
  return SERVICE_READ_CACHED_TABLES.has(match[1]) ? match[1] : null;
}

function toResponse(snapshot: Snapshot): Response {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.headers,
  });
}

export function createServiceReadCache(
  baseFetch: Fetch,
  now: () => number = Date.now,
): { fetch: Fetch; clear: () => void } {
  const entries = new Map<string, { expiresAt: number; snapshot: Snapshot }>();
  const inFlight = new Map<string, Promise<Snapshot>>();
  // Bumped by every write, so a read that started before it is never stored.
  let generation = 0;

  function clear() {
    generation += 1;
    entries.clear();
    inFlight.clear();
  }

  const cachedFetch: Fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = requestMethod(input, init);

    if (method !== "GET" && method !== "HEAD") {
      if (url.includes("/rest/v1/")) clear();
      return baseFetch(input, init);
    }
    if (method !== "GET" || cachedTableFor(url) === null) {
      return baseFetch(input, init);
    }

    // Accept picks one row or many, Prefer carries count and Range paging;
    // each changes the answer, so each is part of the key.
    const key = [
      url,
      headerValue(input, init, "accept"),
      headerValue(input, init, "prefer"),
      headerValue(input, init, "range"),
    ].join("\n");

    const cached = entries.get(key);
    if (cached && cached.expiresAt > now()) return toResponse(cached.snapshot);
    if (cached) entries.delete(key);

    let pending = inFlight.get(key);
    if (!pending) {
      const startedIn = generation;
      // A caller's abort must not cancel a read others are waiting on.
      const { signal: _signal, ...shared } = init ?? {};
      void _signal;
      pending = baseFetch(input, shared).then(async (response) => {
        const snapshot: Snapshot = {
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers.entries()],
          body: await response.text(),
        };
        if (response.ok && startedIn === generation) {
          if (entries.size >= MAX_ENTRIES) entries.clear();
          entries.set(key, { expiresAt: now() + SERVICE_READ_CACHE_TTL_MS, snapshot });
        }
        return snapshot;
      });
      inFlight.set(key, pending);
      const settle = () => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      };
      pending.then(settle, settle);
    }

    const signal = init?.signal;
    if (!signal) return toResponse(await pending);
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const aborted = new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
    return toResponse(await Promise.race([pending, aborted]));
  };

  return { fetch: cachedFetch, clear };
}
