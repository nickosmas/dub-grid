import { NextResponse } from "next/server";
import { toast } from "sonner";
import { signOutFromBrowser } from "@/features/account/client";
import {
  extractRawErrorMessage,
  formatClientErrorMessage,
  isSessionExpiredError,
} from "@/lib/client-facing";
import { isLoggingOut } from "@/lib/logout-state";

/**
 * Build a sanitized JSON error response for an API route handler.
 *
 * Strips technical content (Zod dumps, Supabase/PostgREST errors, JWT/SQL
 * internals) and replaces it with the caller's user-facing fallback. The raw
 * error is logged server-side so observability isn't lost.
 */
export function apiErrorResponse(error: unknown, fallback: string, status = 500): NextResponse {
  console.error("[api]", fallback, error);
  return NextResponse.json({ error: formatClientErrorMessage(error, fallback) }, { status });
}

/** Extract a human-readable message from an unknown error value. */
export function extractErrorMessage(err: unknown, fallback: string): string {
  return formatClientErrorMessage(err, fallback);
}

/**
 * Handle an API / async error with a contextual toast message.
 * @param error   The caught error value
 * @param action  Optional verb phrase describing what failed (e.g. "delete shift", "save profile")
 */
export async function handleApiError(error: unknown, action?: string) {
  // During logout the cache is cleared and the session torn down while the app
  // is still mounted, so in-flight queries fail with 401/expired. Stay silent —
  // signOutLocal already owns the redirect; a toast here would just flash.
  if (isLoggingOut()) return;

  const rawMessage = extractRawErrorMessage(error) ?? "";
  const message = formatClientErrorMessage(error, "");

  // Covers both Supabase's own strings (jwt expired, Invalid Refresh Token, …)
  // and this app's own 401 body text (api-auth.ts's "Your session expired.
  // Please sign in again.") — anything the shared pattern recognizes as
  // session-expiry-shaped. Previously this only matched the exact-cased
  // Supabase strings, so a stale in-flight query hitting one of our own auth
  // routes right after an account switch fell through to the generic toast
  // below instead of signing out and redirecting, leaving the user stuck on
  // a broken page with a confusing "Something went wrong: Your session
  // expired..." message.
  if (isSessionExpiredError(error)) {
    toast.error("Your session expired. Sign in again.", {
      id: "session-expired",
      duration: Infinity,
    });
    await signOutFromBrowser("local");
    window.location.replace("/");
    return;
  }

  if (
    rawMessage.includes("Failed to fetch") ||
    (error instanceof Error && error.name === "TypeError")
  ) {
    toast.error(
      "We're having trouble connecting. If you use an adblocker or privacy shield, try pausing it.",
      { id: "network-error", duration: 8000 },
    );
    return;
  }

  if (rawMessage) {
    console.error("handleApiError:", rawMessage);
  }

  const prefix = action ? `Failed to ${action}` : "Something went wrong";
  const detail = message && message.length < 120 ? `: ${message}` : ". Please try again.";
  toast.error(`${prefix}${detail}`, {
    id: action ? `error-${action.replace(/\s+/g, "-")}` : "generic-error",
  });
}
