import { ACCOUNT_DISABLED_MESSAGE, isAccountDisabledMessage } from "@dubgrid/domain";

/** Shape of the GoTrue AuthError fields this needs, without importing the SDK. */
export type SignInFailure = { message?: string; status?: number; code?: string };

export const EXISTING_ACCOUNT_MESSAGE =
  "This email already has a DubGrid account. Enter that account's password to accept the invitation.";

/**
 * Turn a sign-in failure during invitation acceptance into something true.
 *
 * This step used to assume every failure meant "wrong password", and then —
 * because the account had been created by an earlier attempt — went on to tell
 * a brand-new invitee their address was already registered. A throttled
 * request, a disabled account or a blip in the JWT hook all surfaced as that
 * one confident, wrong sentence, and the real error never reached Sentry.
 *
 * `/api/auth/login` already draws these lines; this mirrors them. Only a
 * genuine credential rejection (a 4xx that isn't a throttle) is allowed to talk
 * about passwords, and only that case may claim the address is taken.
 */
export function describeSignInFailure(error: SignInFailure, registerStatus: string): string {
  // The JWT hook refuses a disabled account with a user-facing sentinel.
  if (isAccountDisabledMessage(error.message)) return ACCOUNT_DISABLED_MESSAGE;

  const httpStatus = typeof error.status === "number" ? error.status : null;

  if (httpStatus === 429 || error.code === "over_request_rate_limit") {
    return "Too many attempts from here. Wait a minute, then try again.";
  }

  // A 5xx from GoTrue (the custom_access_token_hook or its DB connection
  // blipping) is an infra failure, not a rejected password.
  if (httpStatus !== null && httpStatus >= 500) {
    return "We could not sign you in just now. Please try again in a moment.";
  }

  return registerStatus === "existing"
    ? EXISTING_ACCOUNT_MESSAGE
    : "Unable to sign in. Please try again or contact support.";
}
