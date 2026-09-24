import { STEP_UP_REQUIRED_CODE } from "@dubgrid/authz";
import { DEAD_INVITATION_CODE, DEAD_INVITATION_MESSAGE } from "@/lib/auth/dead-invitation";

export type AcceptFailure = "step-up" | "already-accepted" | "dead" | "unavailable";

/**
 * Sort a failed acceptance. Only the opaque dead-token response may be shown
 * as an invalid invitation: a second-factor challenge or an outage used to
 * reach the invitee as "no longer valid", sending them to ask for a new link
 * that would have failed the same way (finding F-12).
 */
export function classifyAcceptFailure(error: unknown): AcceptFailure {
  const fields = (error ?? {}) as { status?: unknown; code?: unknown };
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (fields.status === 403 && fields.code === STEP_UP_REQUIRED_CODE) return "step-up";
  if (
    (fields.code === "P0001" && message.includes("already")) ||
    message.includes("already been accepted")
  ) {
    return "already-accepted";
  }
  if (fields.code === DEAD_INVITATION_CODE) return "dead";
  return "unavailable";
}

export function describeAcceptFailure(
  failure: Exclude<AcceptFailure, "already-accepted">,
  registerStatus: string,
): string {
  if (failure === "dead") {
    return registerStatus === "created"
      ? "Your account was created, but this invitation is no longer valid. " +
          "Please contact your organization administrator for a new invitation."
      : DEAD_INVITATION_MESSAGE;
  }
  if (failure === "step-up") {
    return "We couldn't confirm your authentication code. Try again.";
  }
  return "We couldn't accept your invitation just now. Try again in a moment.";
}
