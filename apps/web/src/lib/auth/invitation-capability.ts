import { NextResponse } from "next/server";

export const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1000;
export const DEAD_INVITATION_MESSAGE =
  "This invitation is no longer valid. Ask your administrator for a new one.";
export const DEAD_INVITATION_CODE = "INVITATION_INVALID";

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
