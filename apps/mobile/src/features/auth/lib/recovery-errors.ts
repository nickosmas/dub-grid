/**
 * Supabase auth errors, translated into copy a signed-out user can act on.
 *
 * Supabase's own messages are written for developers ("Token has expired or is
 * invalid"), and some of them leak implementation detail. Every branch here
 * tells the user what to do next.
 */

function describe(error: unknown): { code: string; message: string; status?: number } {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "",
      message: typeof candidate.message === "string" ? candidate.message : "",
      status: typeof candidate.status === "number" ? candidate.status : undefined,
    };
  }

  return { code: "", message: typeof error === "string" ? error : "" };
}

export function getRecoveryErrorMessage(error: unknown): string {
  if (isAuthRecoveryTimeout(error)) {
    return "This is taking longer than expected. Check your connection and try again.";
  }

  const { code, message, status } = describe(error);
  const haystack = `${code} ${message}`.toLowerCase();

  if (status === 429 || haystack.includes("rate limit") || haystack.includes("over_email_send")) {
    return "Too many requests. Wait a few minutes and try again.";
  }

  if (
    haystack.includes("otp_expired") ||
    haystack.includes("expired") ||
    haystack.includes("invalid")
  ) {
    return "That code has expired or isn't right. Request a new one.";
  }

  if (haystack.includes("same_password")) {
    return "Choose a password you haven't used before.";
  }

  // Supabase's weak-password message names the specific rule that failed, which
  // is more useful than anything generic we could substitute.
  if (haystack.includes("weak_password")) {
    return message || "Choose a stronger password.";
  }

  if (
    haystack.includes("network") ||
    haystack.includes("fetch") ||
    haystack.includes("failed to fetch")
  ) {
    return "We couldn't connect right now. Check your connection and try again.";
  }

  return "Something went wrong. Try again.";
}

/**
 * Whether a failed reset request should be surfaced instead of silently
 * advancing.
 *
 * The request step deliberately advances even when the address has no account,
 * so the screen can't be used to discover which emails are registered. Only
 * failures that are about *us* rather than about the address get shown.
 */
export function shouldSurfaceResetRequestError(error: unknown): boolean {
  if (isAuthRecoveryTimeout(error)) return true;

  const { message, status, code } = describe(error);
  const haystack = `${code} ${message}`.toLowerCase();

  return (
    status === 429 ||
    haystack.includes("rate limit") ||
    haystack.includes("over_email_send") ||
    haystack.includes("network") ||
    haystack.includes("fetch")
  );
}
import { isAuthRecoveryTimeout } from "@dubgrid/client-errors";
