import { describe, expect, it } from "vitest";
import {
  DEAD_INVITATION_CODE,
  DEAD_INVITATION_MESSAGE,
  INVITATION_LIFETIME_MS,
  deadInvitationResponse,
  isDeadInvitationError,
} from "./invitation-capability";

describe("invitation capability contract", () => {
  it("uses one 72-hour lifetime", () => {
    expect(INVITATION_LIFETIME_MS).toBe(72 * 60 * 60 * 1000);
  });

  it("returns one external response for every dead invitation state", async () => {
    const response = deadInvitationResponse();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: DEAD_INVITATION_MESSAGE,
      code: DEAD_INVITATION_CODE,
    });
  });

  it("recognizes only the stable database dead-invitation code", () => {
    expect(isDeadInvitationError({ message: `rpc failed: ${DEAD_INVITATION_CODE}` })).toBe(true);
    expect(isDeadInvitationError({ message: "connection unavailable" })).toBe(false);
    expect(isDeadInvitationError(null)).toBe(false);
  });
});
