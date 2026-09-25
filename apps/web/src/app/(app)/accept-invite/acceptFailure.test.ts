import { describe, expect, it } from "vitest";
import { STEP_UP_REQUIRED_CODE } from "@dubgrid/authz";
import { DEAD_INVITATION_CODE, DEAD_INVITATION_MESSAGE } from "@/lib/auth/dead-invitation";
import {
  classifyAcceptFailure,
  describeAcceptFailure,
  describeDeadInvitation,
} from "./acceptFailure";

function requestError(status: number, code: string | null, message = "Request failed") {
  return Object.assign(new Error(message), { status, code });
}

describe("classifyAcceptFailure", () => {
  it("recognises a second-factor challenge rather than a dead invitation", () => {
    expect(classifyAcceptFailure(requestError(403, STEP_UP_REQUIRED_CODE))).toBe("step-up");
  });

  it("does not treat another 403 as a challenge", () => {
    expect(classifyAcceptFailure(requestError(403, null))).toBe("unavailable");
  });

  it("reports the opaque dead-token response as dead", () => {
    expect(classifyAcceptFailure(requestError(404, DEAD_INVITATION_CODE))).toBe("dead");
  });

  it("keeps an already-accepted invitation distinct", () => {
    expect(classifyAcceptFailure(new Error("Invitation has already been accepted"))).toBe(
      "already-accepted",
    );
  });

  it("never reports an outage or a codeless failure as a dead invitation", () => {
    expect(classifyAcceptFailure(requestError(500, null))).toBe("unavailable");
    expect(classifyAcceptFailure(new TypeError("Failed to fetch"))).toBe("unavailable");
    expect(classifyAcceptFailure(new Error("Invitation expired"))).toBe("unavailable");
  });
});

describe("describeAcceptFailure", () => {
  it("tells a transient failure to retry instead of asking for a new link", () => {
    expect(describeAcceptFailure("unavailable")).toMatch(/try again/i);
    expect(describeAcceptFailure("unavailable")).not.toMatch(/no longer works/);
  });
});

describe("describeDeadInvitation", () => {
  it("points to the newest email, since a reissue replaces the link", () => {
    expect(DEAD_INVITATION_MESSAGE).toMatch(/replaces any earlier one/);
    expect(DEAD_INVITATION_MESSAGE).toMatch(/more recent invitation email, use its link/);
    expect(DEAD_INVITATION_MESSAGE).toMatch(/already accepted, sign in/);
  });

  // The message is the same for every reason, so it must not name one.
  it("never says why the link is dead", () => {
    for (const message of [describeDeadInvitation(false), describeDeadInvitation(true)]) {
      expect(message).not.toMatch(/expired|revoked|cancel/i);
    }
  });

  it("only claims an account was created when this attempt created one", () => {
    expect(describeDeadInvitation(true)).toMatch(/^Your DubGrid account was created/);
    expect(describeDeadInvitation(false)).toBe(DEAD_INVITATION_MESSAGE);
  });
});
