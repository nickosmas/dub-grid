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
  INVALID_INPUT: "Some of the details look off. Please review and try again.",
  INVALID_BODY: "We couldn't read that request. Please try again.",
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
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
    pattern:
      /jwt expired|refresh token not found|invalid refresh token|invalid session|unauthenticated|session expired/i,
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
    pattern:
      /email service not configured|invitation email could not be sent|failed to send (?:invitation )?email/i,
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
