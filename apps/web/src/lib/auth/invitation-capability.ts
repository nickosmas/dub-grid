import { NextResponse } from "next/server";
import { DEAD_INVITATION_CODE, DEAD_INVITATION_MESSAGE } from "./dead-invitation";

export { DEAD_INVITATION_CODE, DEAD_INVITATION_MESSAGE };
export { INVITATION_LIFETIME_MS } from "@dubgrid/domain";

export function deadInvitationResponse(): NextResponse {
  return NextResponse.json(
    { error: DEAD_INVITATION_MESSAGE, code: DEAD_INVITATION_CODE },
    { status: 404 },
  );
}

export function isDeadInvitationError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  return String((error as { message?: unknown }).message ?? "").includes(DEAD_INVITATION_CODE);
}
