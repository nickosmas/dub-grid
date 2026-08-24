/**
 * Dev-aware Sentry shim.
 *
 * In production  → all calls forwarded to the real @sentry/nextjs SDK.
 * In development → all calls are no-ops so the SDK never loads and never
 *                  triggers the pages-manifest / prerender-manifest / routes-manifest
 *                  scans that cause ENOENT 500s in the Turbopack dev server.
 *
 * All files in the codebase should import from "@/lib/sentry" instead of
 * "@sentry/nextjs" directly so this shim is the single gating point.
 *
 * The SDK is loaded via a top-level `if (process.env.NODE_ENV !== "development")`
 * block. Turbopack inlines NODE_ENV at compile time and dead-code-eliminates
 * the entire block in dev, so `require("@sentry/nextjs")` is never resolved
 * or bundled during development — preventing the ENOENT manifest scans.
 */

// ── Type stubs so TypeScript is happy when the real SDK isn't loaded ──────────

type SeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";
type SentryUser = { id?: string; email?: string; [key: string]: unknown } | null;
type CaptureContext = { extra?: Record<string, unknown>; [key: string]: unknown };

// ── No-op implementations ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (...args: unknown[]) => {};

const devLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  trace: noop,
  log: noop,
};

// ── Load the real SDK in production only ─────────────────────────────────────
//
// This top-level `if` block is dead-code-eliminated by Turbopack/webpack in dev
// because process.env.NODE_ENV is inlined as "development" at compile time,
// making the condition `"development" !== "development"` → `false`.
// The `require("@sentry/nextjs")` inside is therefore never seen by the
// bundler's module resolver during dev builds.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: Record<string, any> | undefined;

/**
 * In the browser the SDK is loaded asynchronously; on the server it is not.
 *
 * @sentry/nextjs is 1.39 MB parsed, and a synchronous require put all of it in
 * the chunk group every single route loads — 85% of that shared bundle, on the
 * marketing page and every app screen alike, blocking first paint to deliver
 * error monitoring that is not needed until something actually throws. Loading
 * it with a dynamic import moves it to its own async chunk.
 *
 * Server and Edge keep the synchronous require. There is no bundle-size cost
 * there, `instrumentation.ts` expects captureRequestError to exist the moment
 * it is imported, and the dev dead-code-elimination trick described above still
 * depends on this exact shape.
 *
 * Calls made before the browser load resolves are queued rather than dropped,
 * so an error thrown during startup is still reported.
 */
let _pending: Array<() => void> | null = null;
let _resolveReady: () => void = () => {};

/** Resolves once the SDK is usable — immediately wherever it loads synchronously. */
export const sentryReady: Promise<void> = new Promise((resolve) => {
  _resolveReady = resolve;
});

if (process.env.NODE_ENV !== "development") {
  if (typeof window === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sdk = require("@sentry/nextjs");
    _resolveReady();
  } else {
    _pending = [];
    void import("@sentry/nextjs")
      .then((mod) => {
        _sdk = mod as unknown as Record<string, unknown>;
        const queued = _pending ?? [];
        _pending = null;
        for (const run of queued) run();
      })
      .catch(() => {
        // Monitoring must never take the app down with it. Drop the queue and
        // let every call fall through to a no-op from here on.
        _pending = null;
      })
      .finally(() => _resolveReady());
  }
} else {
  _resolveReady();
}

/** Runs now if the SDK is here, queues if it is still loading, else discards. */
function dispatch(run: () => void): void {
  if (_sdk) {
    run();
    return;
  }
  if (_pending) _pending.push(run);
}

// ── Platform kill switch (server-side only) ───────────────────────────────────
//
// This module is imported from both server and client code, and the flags
// table read (isFeatureEnabled) is server-only (service-role Supabase +
// Redis) — so the kill switch only gates server-side captures. It can't gate
// the top-level SDK load above without breaking the dead-code-elimination
// trick, so instead it wraps just captureException/captureMessage, the two
// calls that actually generate billable events, using a short-TTL in-memory
// cache refreshed via a dynamic import (kept out of the client bundle).

const SENTRY_FLAG_TTL_MS = 30_000;
let _sentryFlagEnabled = true;
let _sentryFlagCheckedAt = 0;

function refreshSentryFlagIfStale(): void {
  // Client AND Edge Middleware both always follow the dev/prod shim above —
  // `typeof window === "undefined"` is true in Edge Runtime too, so without
  // this it would (harmlessly, but pointlessly) pull the feature-flags ->
  // cache -> supabase-service -> logger module graph into every Edge
  // Middleware bundle and fire a Redis/Postgres read on a globally
  // distributed hot path (any JWT/org-access error) that isn't the intent
  // described above — middleware isn't where anyone would go to check
  // whether Sentry itself is misbehaving.
  if (typeof window !== "undefined" || process.env.NEXT_RUNTIME === "edge") return;
  const now = Date.now();
  if (now - _sentryFlagCheckedAt < SENTRY_FLAG_TTL_MS) return;
  _sentryFlagCheckedAt = now; // mark checked immediately so concurrent calls don't pile up requests
  void import("@/lib/feature-flags")
    .then(({ isFeatureEnabled }) => isFeatureEnabled("sentry"))
    .then((enabled) => {
      _sentryFlagEnabled = enabled;
    })
    .catch(async (err) => {
      // Fail open — keep the last known value rather than losing error visibility.
      // Still log: a persistent failure here would otherwise silently keep Sentry
      // on/off against the admin's intent with zero observability. Dynamic import,
      // same as feature-flags above, to keep this out of the client bundle.
      const { default: logger } = await import("@/lib/logger");
      logger.error({ err }, "Sentry kill-switch flag refresh failed");
    });
}

function sentryKillSwitchEnabled(): boolean {
  refreshSentryFlagIfStale();
  return _sentryFlagEnabled;
}

// ── Conditional re-exports ────────────────────────────────────────────────────

// Each of these resolves _sdk when *called*, not when this module is evaluated.
// In the browser the SDK arrives later, so binding at evaluation time would
// freeze every export as a permanent no-op.

// captureException
export const captureException: (error: unknown, context?: CaptureContext) => void = (...args) => {
  if (!sentryKillSwitchEnabled()) return;
  dispatch(() => _sdk!.captureException(...args));
};

// captureMessage
export const captureMessage: (message: string, level?: SeverityLevel) => void = (...args) => {
  if (!sentryKillSwitchEnabled()) return;
  dispatch(() => _sdk!.captureMessage(...args));
};

// setUser
export const setUser: (user: SentryUser) => void = (...args) => {
  dispatch(() => _sdk!.setUser(...args));
};

// setTag
export const setTag: (key: string, value: string) => void = (...args) => {
  dispatch(() => _sdk!.setTag(...args));
};

// logger (structured logging via Sentry). A stable object whose methods resolve
// per call, so a reference taken at import time still reaches the real logger
// once the SDK lands.
export const logger: typeof devLogger = {
  info: (...args) => dispatch(() => _sdk!.logger?.info?.(...args)),
  warn: (...args) => dispatch(() => _sdk!.logger?.warn?.(...args)),
  error: (...args) => dispatch(() => _sdk!.logger?.error?.(...args)),
  debug: (...args) => dispatch(() => _sdk!.logger?.debug?.(...args)),
  trace: (...args) => dispatch(() => _sdk!.logger?.trace?.(...args)),
  log: (...args) => dispatch(() => _sdk!.logger?.log?.(...args)),
};

/**
 * Session Replay, taken from the already-loaded SDK.
 *
 * Deliberately not a second `import("@sentry/nextjs")` at the call site: a
 * separate import specifier gave the bundler a second reason to reference the
 * package, which kept a 229 KB slice of Replay in the eager root chunk group
 * even though the rest had moved to an async chunk. Reading it off the module
 * loaded here keeps Sentry to exactly one chunk.
 *
 * Returns null when the SDK is unavailable (dev, or a failed load), so the
 * caller simply attaches nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReplayIntegration(): Promise<any | null> {
  await sentryReady;
  return _sdk?.replayIntegration?.() ?? null;
}

// addIntegration — lets us attach replay lazily once analytics consent is granted
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const addIntegration: (integration: any) => void = (integration) => {
  dispatch(() => _sdk!.addIntegration(integration));
};

// getClient — used to detect whether replay was already attached. Returns
// undefined until the SDK is loaded; await sentryReady first if that matters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getClient: () => any = () => _sdk?.getClient?.();

// captureRouterTransitionStart — exported from instrumentation-client.ts.
// Must stay synchronous and pass its argument through: Next calls it during a
// navigation and does not wait on it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const captureRouterTransitionStart: (...args: any[]) => any = (...args) => {
  if (_sdk) return _sdk.captureRouterTransitionStart?.(...args);
  return args[0];
};

// captureRequestError — exported from instrumentation.ts on the server, where
// the SDK is always loaded synchronously by the time this can be called.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const captureRequestError: (...args: any[]) => any = (...args) => {
  dispatch(() => _sdk!.captureRequestError(...args));
};

// init — used in sentry.server/edge/client config files
export const init: (options: Record<string, unknown>) => void = (...args) => {
  dispatch(() => _sdk!.init(...args));
};

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Set Sentry user context so errors are associated with a specific user.
 * Call on auth state changes (login/logout).
 */
export function setSentryUser(
  user: { id: string; email?: string; orgId?: string; role?: string } | null,
) {
  if (user) {
    setUser({ id: user.id, email: user.email });
    if (user.orgId) setTag("org_id", user.orgId);
    if (user.role) setTag("role", user.role);
  } else {
    setUser(null);
  }
}
