export const AUTH_ENTRY_REQUEST_KINDS = [
  "login",
  "browser_session",
  "browser_user",
  "protected_document",
  "organization_context",
  "organization_bootstrap",
  "permissions",
  "session_tracking",
] as const;

export type AuthEntryRequestKind = (typeof AUTH_ENTRY_REQUEST_KINDS)[number];
export type AuthEntryJourney = "cold_sign_in" | "warm_refresh";

const TRACKED_APP_PATHS: Readonly<Record<string, AuthEntryRequestKind>> = {
  "/api/auth/login": "login",
  "/api/account/org-context": "organization_context",
  "/api/organization/bootstrap": "organization_bootstrap",
  "/api/account/permissions": "permissions",
  "/api/auth/track-session": "session_tracking",
};

const SAFE_TIMING_NAMES = new Set([
  "total",
  "ratelimit",
  "signin",
  "gridmaster_login_intent",
  "post_signin_orchestration",
  "jwt_verify",
  "mw_profile",
  "mw_membership",
  "mw_impersonation_verify",
  "mw_sandbox",
  "mw_org_access",
  "auth",
  "resolve_org",
  "permissions",
  "fanout",
  "config",
  "employee_count",
  "entry_gate",
  "admin_entry_gate",
]);

export interface AuthEntryRequestObservation {
  kind: AuthEntryRequestKind;
  serverTiming: string | null;
}

export interface AuthEntrySample {
  journey: AuthEntryJourney;
  durationMs: number;
  requestCounts: Partial<Record<AuthEntryRequestKind, number>>;
  serverTimingsMs: Record<string, number>;
}

interface NumericSummary {
  median: number;
  p95: number;
  max: number;
}

export interface AuthEntryJourneySummary {
  samples: number;
  durationMs: NumericSummary;
  requestCounts: Partial<Record<AuthEntryRequestKind, NumericSummary>>;
  serverTimingsMs: Record<string, NumericSummary>;
}

export interface AuthEntryReport {
  schemaVersion: 1;
  target: "calmhaven-local";
  journeys: Record<AuthEntryJourney, AuthEntryJourneySummary>;
}

export function classifyAuthEntryRequest(
  rawUrl: string,
  resourceType: string,
): AuthEntryRequestKind | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const trackedPath = TRACKED_APP_PATHS[url.pathname];
  if (trackedPath) return trackedPath;

  if (url.pathname === "/auth/v1/token") return "browser_session";
  if (url.pathname === "/auth/v1/user") return "browser_user";

  if (
    (resourceType === "document" || url.searchParams.has("_rsc")) &&
    (url.pathname === "/dashboard" ||
      url.pathname === "/schedule" ||
      url.pathname === "/people" ||
      url.pathname === "/settings")
  ) {
    return "protected_document";
  }

  return null;
}

export function parseSafeServerTiming(header: string | null): Record<string, number> {
  if (!header) return {};

  const result: Record<string, number> = {};
  for (const metric of header.split(",")) {
    const [rawName, ...parameters] = metric.trim().split(";");
    const name = rawName?.trim() ?? "";
    if (!SAFE_TIMING_NAMES.has(name)) continue;

    const durationParameter = parameters.find((parameter) => parameter.trim().startsWith("dur="));
    if (!durationParameter) continue;

    const duration = Number(durationParameter.trim().slice(4));
    if (Number.isFinite(duration) && duration >= 0) {
      result[name] = round(duration);
    }
  }
  return result;
}

export function buildAuthEntrySample(
  journey: AuthEntryJourney,
  durationMs: number,
  observations: readonly AuthEntryRequestObservation[],
): AuthEntrySample {
  const requestCounts: Partial<Record<AuthEntryRequestKind, number>> = {};
  const serverTimingsMs: Record<string, number> = {};

  for (const observation of observations) {
    requestCounts[observation.kind] = (requestCounts[observation.kind] ?? 0) + 1;
    for (const [name, duration] of Object.entries(
      parseSafeServerTiming(observation.serverTiming),
    )) {
      const key = `${observation.kind}.${name}`;
      serverTimingsMs[key] = round((serverTimingsMs[key] ?? 0) + duration);
    }
  }

  return {
    journey,
    durationMs: round(durationMs),
    requestCounts,
    serverTimingsMs,
  };
}

export function summarizeAuthEntrySamples(samples: readonly AuthEntrySample[]): AuthEntryReport {
  return {
    schemaVersion: 1,
    target: "calmhaven-local",
    journeys: {
      cold_sign_in: summarizeJourney(samples, "cold_sign_in"),
      warm_refresh: summarizeJourney(samples, "warm_refresh"),
    },
  };
}

function summarizeJourney(
  samples: readonly AuthEntrySample[],
  journey: AuthEntryJourney,
): AuthEntryJourneySummary {
  const journeySamples = samples.filter((sample) => sample.journey === journey);
  const requestCounts: Partial<Record<AuthEntryRequestKind, NumericSummary>> = {};
  const serverTimingsMs: Record<string, NumericSummary> = {};

  for (const kind of AUTH_ENTRY_REQUEST_KINDS) {
    const values = journeySamples.map((sample) => sample.requestCounts[kind] ?? 0);
    if (values.some((value) => value > 0)) requestCounts[kind] = summarizeNumbers(values);
  }

  const timingKeys = new Set(
    journeySamples.flatMap((sample) => Object.keys(sample.serverTimingsMs)),
  );
  for (const key of [...timingKeys].sort()) {
    serverTimingsMs[key] = summarizeNumbers(
      journeySamples.map((sample) => sample.serverTimingsMs[key] ?? 0),
    );
  }

  return {
    samples: journeySamples.length,
    durationMs: summarizeNumbers(journeySamples.map((sample) => sample.durationMs)),
    requestCounts,
    serverTimingsMs,
  };
}

function summarizeNumbers(values: readonly number[]): NumericSummary {
  if (values.length === 0) return { median: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    median: round(median),
    p95: round(sorted[p95Index]!),
    max: round(sorted.at(-1)!),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
