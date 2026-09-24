import { describe, expect, it } from "vitest";
import { STEP_UP_REQUIRED_CODE } from "@dubgrid/authz";
import { DEAD_INVITATION_CODE, DEAD_INVITATION_MESSAGE } from "@/lib/auth/dead-invitation";
import { classifyAcceptFailure, describeAcceptFailure } from "./acceptFailure";

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
  it("only claims an account was created when one was", () => {
    expect(describeAcceptFailure("dead", "created")).toMatch(/account was created/);
    expect(describeAcceptFailure("dead", "existing")).toBe(DEAD_INVITATION_MESSAGE);
  });

  it("tells a transient failure to retry instead of asking for a new link", () => {
    expect(describeAcceptFailure("unavailable", "existing")).not.toMatch(/no longer valid/);
  });
});
