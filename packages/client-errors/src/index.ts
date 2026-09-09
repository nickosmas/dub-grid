/**
 * Shared client-facing error translation.
 *
 * Both the web app (`apps/web/src/lib/client-facing.ts`) and the mobile app
 * (`apps/mobile/src/shared/lib/errors.ts`) delegate to this module so a single
 * source of truth governs:
 *  - which raw error strings get rewritten into friendly copy,
 *  - which raw strings are "technical" and must be hidden behind a fallback,
 *  - how network failures are detected and worded.
 *
 * This package is platform-neutral: no DOM, React Native, Node, or `process.env`
 * usage. App-specific concerns (toast builders, dev-server network hints,
 * sign-out side effects) stay in each app's adapter.
 */

// ── Canonical copy ───────────────────────────────────────────────────────────

/** Title for the persistent "you're offline" toast. */
export const NETWORK_ERROR_TITLE = "Network connection issue";

/**
 * Canonical connectivity message, shared by web and mobile. The web app may
 * append an adblocker hint as a separate description line.
 */
export const NETWORK_ERROR_MESSAGE = "Check your internet connection and try again.";

/** Default fallback when an error can't be translated and isn't safe to show. */
export const DEFAULT_ERROR_FALLBACK = "Something went wrong. Please try again.";

/**
 * Canonical error messages returned by web API route handlers. Use these
 * instead of inlined HTTP-status-style strings like "Unauthorized" or
 * "Invalid input" — the wording here matches the warm/non-blaming tone used
 * across the rest of the app and is consistent across every route.
 */
export const API_ERRORS = {
  INVALID_INPUT: "Some of those details look off. Review them and try again.",
  INVALID_BODY: "We couldn't read that request. Try again.",
  /**
   * A malformed request the user never typed (bad query params, a stale link).
   * Distinct from INVALID_INPUT, which points at something they can fix.
   */
  INVALID_REQUEST: "We couldn't complete that request. Refresh the page and try again.",
  UNAUTHORIZED: "Sign in to continue.",
  /** Something broke on our side. Never expose the underlying cause. */
  UNEXPECTED: "Something went wrong on our end. Try again in a moment.",
  /**
   * The 503 an endpoint returns when it fails closed — a misconfigured rate
   * limiter, a dependency it can't reach. "Service temporarily unavailable"
   * named the mechanism and left the reader with nothing to do.
   */
  SERVICE_UNAVAILABLE: "We're having trouble completing that right now. Try again in a moment.",
  // Generic fallback — used by CLIENT_FRIENDLY_ERROR_PATTERNS' catch-all regex
  // for any forbidden/unauthorized error that isn't one of the specific
  // causes below. Prefer a specific constant at new call sites.
  FORBIDDEN: "You don't have permission to do that.",
  NOT_ORG_MEMBER: "You don't have access to this organization.",
  INSUFFICIENT_PERMISSION:
    "You don't have permission to perform this action. Ask an admin for help.",
  CANNOT_MANAGE_EMPLOYEES:
    "You don't have permission to manage employees. Ask an admin to make this change.",
  CANNOT_ASSIGN_SUPER_ADMIN: "Only a super admin or gridmaster can assign the super admin role.",
  SUPER_ADMIN_OR_GRIDMASTER_ONLY: "Only a super admin or gridmaster can send invitations.",
  GRIDMASTER_ONLY: "This action is restricted to gridmaster accounts.",
  SUPER_ADMIN_ONLY: "Only a super admin can do this.",
  CANNOT_ACT_FOR_OTHERS: "You can only do this for your own shift requests.",
  CANNOT_VIEW_EMPLOYEE_DETAILS: "You don't have permission to view this employee's details.",
  CANNOT_VIEW_MANAGEMENT_PROFILE: "You don't have permission to view management profiles.",
} as const;

// ── Pattern tables ───────────────────────────────────────────────────────────

/**
 * Substrings/patterns that indicate a connectivity failure rather than an
 * application error. Union of the web and mobile lists.
 */
export const NETWORK_ERROR_PATTERNS: readonly RegExp[] = [
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /connection refused/i,
  /internet connection/i,
  /network connection/i,
  /couldn't reach the mobile backend/i,
  /could not reach the mobile backend/i,
  /couldn't connect to dubgrid/i,
  /couldn't reach dubgrid/i,
  /same wifi/i,
  /offline/i,
];

/**
 * Matches any raw error shape (Supabase's own strings, or this app's own 401
 * body text like "Your session expired. Please sign in again.") that means the
 * caller needs a fresh sign-in. Single source of truth — callers that need to
 * react to session expiry (e.g. by signing out and redirecting) should test
 * against this instead of hand-rolling their own substring list, which drifts
 * from the copy below and misses cases silently.
 */
export const SESSION_EXPIRED_PATTERN =
  /jwt expired|refresh token not found|invalid refresh token|invalid session|unauthenticated|session expired/i;

/** True when the raw error message indicates the session needs a fresh sign-in. */
export function isSessionExpiredError(error: unknown): boolean {
  const message = getErrorMessage(error);
  if (!message) return false;
  return SESSION_EXPIRED_PATTERN.test(message);
}

/**
 * Raw error messages rewritten into friendly, user-facing copy. The union of
 * the web and mobile pattern tables, with overlapping auth/session patterns
 * reconciled to a single canonical message each. Evaluated in order — the first
 * match wins.
 */
export const CLIENT_FRIENDLY_ERROR_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  message: string;
}> = [
  {
    pattern: /invalid login credentials|invalid email or password/i,
    message: "Check your email and password and try again.",
  },
  {
    pattern: SESSION_EXPIRED_PATTERN,
    message: "Your session expired. Sign in again to continue.",
  },
  {
    pattern:
      /can't perform this action on your own account|cannot perform this action on your own account/i,
    message: "You can't perform this action on your own account. Ask another admin.",
  },
  {
    pattern: /unauthorized|forbidden|not authorized|permission denied/i,
    message: "You don't have permission to do that.",
  },
  {
    pattern:
      /open shift is no longer available|open-shift.*no longer available|coverage gap.*no longer/i,
    message: "That open shift is no longer available.",
  },
  {
    pattern: /already volunteered for this open shift/i,
    message: "You already volunteered for this open shift.",
  },
  {
    pattern: /already have a shift|overlapping shift|overlapping times/i,
    message: "You already have a shift during that time.",
  },
  {
    pattern: /eligibility requirements|do not meet the eligibility/i,
    message: "You don't meet the eligibility requirements for this shift.",
  },
  {
    pattern: /not assigned to the focus area|required focus area/i,
    message: "You are not assigned to the focus area required for this shift.",
  },
  {
    pattern: /another active shift request/i,
    message: "You already have an active request for that date.",
  },
  {
    pattern: /already started|has already started/i,
    message: "That shift has already started.",
  },
  {
    pattern:
      /organization.*not found|could not find organization|no organization matched that slug/i,
    message: "We couldn't find that organization. Check the subdomain and try again.",
  },
  {
    pattern: /email not confirmed/i,
    message: "Confirm your email address before signing in.",
  },
  {
    pattern:
      /invalid.*(?:mfa|totp|verification code|code)|mfa_verification_failed|challenge.*expired/i,
    message: "That code didn't work. Check your authenticator app and try again.",
  },
  {
    // Covers both the old backend wording and the current API response copy,
    // so an in-flight response from either version still lands here.
    pattern:
      /email service not configured|invitation email could not be sent|failed to send (?:invitation )?email|couldn't send that (?:invitation )?email/i,
    message: "We couldn't send that invitation email. Try again in a moment.",
  },
];

/**
 * Patterns that mark a raw message as "technical" — leaking backend internals,
 * SQL, infra, or identifiers. Messages matching these are replaced with the
 * caller's fallback instead of being shown verbatim.
 */
export const TECHNICAL_ERROR_PATTERNS: readonly RegExp[] = [
  /PGRST\d*/i,
  /PostgREST/i,
  /Supabase/i,
  /row-level security|RLS/i,
  /SQL|database|schema|relation|column|constraint|foreign key|duplicate key/i,
  /RPC|function .* does not exist/i,
  /JWT/i,
  /UUID/i,
  /\b(org_id|user_id|employee_id|resource_id|metadata|payload)\b/i,
  /JSON|non-JSON/i,
  /service role|environment variable|env var/i,
  /HTTP\s+\d{3}/i,
  // Postgres/driver-level connection and timeout failures — infra problems on
  // the backend, not the caller's network (see NETWORK_ERROR_PATTERNS for that),
  // so these route to the generic fallback rather than the "check your
  // connection" copy.
  /statement timeout|query.*timed? ?out|idle.?in.?transaction timeout/i,
  /connection (terminated|closed|reset)|server closed the connection/i,
  /too many connections|out of shared memory|out of memory/i,
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/,
  // Raw JSON dumps and Zod issue arrays carried as plain strings.
  /^\s*\[\s*\{/,
  /"code"\s*:\s*"invalid_type"/i,
  /"path"\s*:\s*\[/i,
];

// ── Raw message extraction ───────────────────────────────────────────────────

/**
 * Duck-type check for `ZodError`-shaped objects. ZodError's `.message` is the
 * JSON-stringified issues array — never safe to surface to a user, even when
 * routed through `formatClientErrorMessage`.
 */
function isZodLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { name?: unknown }).name === "ZodError") return true;
  return Array.isArray((error as { issues?: unknown }).issues);
}

/**
 * Pull a human-readable message out of an unknown thrown value. Returns `null`
 * when there is nothing meaningful to show.
 */
export function getErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (isZodLikeError(error)) return null;

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const trimmed = (error as { message: string }).message.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

// ── Detection helpers ────────────────────────────────────────────────────────

/** True when the error looks like a connectivity failure. */
export function isNetworkConnectionError(error: unknown): boolean {
  const message = getErrorMessage(error);
  if (!message) return false;
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** True when the error looks like an authorization/permission failure. */
export function isAuthorizationError(error: unknown): boolean {
  const message = getErrorMessage(error);
  if (!message) return false;
  return /unauthorized|forbidden|not authorized|permission denied/i.test(message);
}

/**
 * When the error is an intentional "Organization unavailable." gate message,
 * return it verbatim (it is already user-facing copy). Otherwise return `null`.
 */
export function getOrgUnavailableMessage(error: unknown): string | null {
  const message = getErrorMessage(error);
  if (!message || !/^organization unavailable\./i.test(message)) {
    return null;
  }
  return message;
}

// ── Translation ──────────────────────────────────────────────────────────────

/**
 * Rewrite a raw error message into friendly copy when it matches a known
 * pattern. Returns `null` when no friendly rewrite applies.
 */
export function translateErrorMessage(rawMessage: string): string | null {
  const matched = CLIENT_FRIENDLY_ERROR_PATTERNS.find(({ pattern }) => pattern.test(rawMessage));
  return matched ? matched.message : null;
}

/** True when a raw message exposes technical/backend internals. */
export function isTechnicalErrorMessage(rawMessage: string): boolean {
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(rawMessage));
}

/**
 * Translate an unknown error into a message safe to show a user.
 *
 * Pipeline: connectivity failure → canonical network copy; intentional
 * "Organization unavailable." gate → verbatim; known friendly pattern → friendly
 * copy; technical/backend leak → caller's fallback; otherwise → the raw message
 * (it is plain enough to surface).
 */
export function formatClientErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_ERROR_FALLBACK,
): string {
  if (isNetworkConnectionError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }

  const rawMessage = getErrorMessage(error);
  if (!rawMessage) return fallback;

  const orgUnavailable = getOrgUnavailableMessage(rawMessage);
  if (orgUnavailable) return orgUnavailable;

  const friendly = translateErrorMessage(rawMessage);
  if (friendly) return friendly;

  if (isTechnicalErrorMessage(rawMessage)) return fallback;

  return rawMessage;
}

export const AUTH_RECOVERY_MAX_AUTOMATIC_RETRIES = 3;
export const AUTH_RECOVERY_BASE_DELAY_MS = 1_000;
export const AUTH_RECOVERY_MAX_DELAY_MS = 30_000;

type RecoveryErrorShape = {
  name?: unknown;
  retryAfter?: unknown;
  retryAfterMs?: unknown;
  status?: unknown;
};

function getRecoveryErrorShape(error: unknown): RecoveryErrorShape | null {
  return typeof error === "object" && error !== null ? (error as RecoveryErrorShape) : null;
}

/** True when the caller, rather than the network deadline, cancelled the work. */
export function isAuthRecoveryCancellation(error: unknown): boolean {
  return getRecoveryErrorShape(error)?.name === "AbortError";
}

/** True when an owned request deadline expired. */
export function isAuthRecoveryTimeout(error: unknown): boolean {
  const name = getRecoveryErrorShape(error)?.name;
  return name === "TimeoutError" || name === "RequestTimeoutError";
}

/** Whether an authentication-entry failure is safe to retry automatically. */
export function isRetryableAuthRecoveryError(error: unknown): boolean {
  if (isAuthRecoveryCancellation(error)) return false;
  if (isAuthRecoveryTimeout(error) || isNetworkConnectionError(error)) return true;

  const status = getRecoveryErrorShape(error)?.status;
  return (
    status === 408 ||
    status === 429 ||
    (typeof status === "number" && status >= 500 && status < 600)
  );
}

/** Parse an HTTP Retry-After value into milliseconds from now. */
export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : null;
  }

  if (!/^[A-Za-z]{3},\s/.test(normalized)) return null;

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
}

/** Read Retry-After metadata from either web or shared API-client errors. */
export function getAuthRecoveryRetryAfterMs(error: unknown, nowMs = Date.now()): number | null {
  const shape = getRecoveryErrorShape(error);
  if (!shape) return null;

  if (
    typeof shape.retryAfterMs === "number" &&
    Number.isFinite(shape.retryAfterMs) &&
    shape.retryAfterMs >= 0
  ) {
    return shape.retryAfterMs;
  }

  return typeof shape.retryAfter === "string" ? parseRetryAfterMs(shape.retryAfter, nowMs) : null;
}

export function shouldRetryAuthRecovery(
  failureCount: number,
  error: unknown,
  maxAutomaticRetries = AUTH_RECOVERY_MAX_AUTOMATIC_RETRIES,
): boolean {
  return failureCount < maxAutomaticRetries && isRetryableAuthRecoveryError(error);
}

export function getAuthRecoveryRetryDelay(
  error: unknown,
  failureCount: number,
  options: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    nowMs?: number;
    random?: () => number;
  } = {},
): number {
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? AUTH_RECOVERY_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? AUTH_RECOVERY_MAX_DELAY_MS);
  const attempt = Math.max(0, Math.floor(failureCount));
  const cappedDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const random = Math.min(1, Math.max(0, (options.random ?? Math.random)()));
  const jitteredDelay = Math.round(cappedDelay * (0.5 + random * 0.5));
  const retryAfterMs = getAuthRecoveryRetryAfterMs(error, options.nowMs);

  return retryAfterMs === null ? jitteredDelay : Math.max(jitteredDelay, retryAfterMs);
}

/** Coalesce concurrent recovery triggers into one underlying attempt. */
export function createAuthRecoverySingleFlight<Result>(
  attempt: () => Promise<Result> | Result,
): () => Promise<Result> {
  let inFlight: Promise<Result> | null = null;

  return () => {
    if (inFlight) return inFlight;

    let current: Promise<Result>;
    try {
      current = Promise.resolve(attempt());
    } catch (error) {
      current = Promise.reject(error);
    }
    inFlight = current;
    const clear = () => {
      if (inFlight === current) inFlight = null;
    };
    void current.then(clear, clear);
    return current;
  };
}
