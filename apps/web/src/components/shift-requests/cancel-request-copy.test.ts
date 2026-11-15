import { describe, expect, it } from "vitest";
import { describeCancelRequestConfirmation } from "./cancel-request-copy";

describe("describeCancelRequestConfirmation", () => {
  it("cautions when the person asked hasn't answered yet", () => {
    expect(
      describeCancelRequestConfirmation({ type: "swap", status: "open", targetEmpId: "emp-2" }),
    ).toEqual({
      message: "The other person hasn't responded to this swap yet.",
      points: ["The request is withdrawn for both people.", "Nothing on the schedule changes."],
    });
    expect(
      describeCancelRequestConfirmation({ type: "pickup", status: "open", targetEmpId: "emp-2" })
        .message,
    ).toBe("The other person hasn't responded to this pickup yet.");
  });

  it("says nothing more for a request nobody else has to answer", () => {
    expect(
      describeCancelRequestConfirmation({ type: "pickup", status: "open", targetEmpId: null }),
    ).toEqual({});
    expect(
      describeCancelRequestConfirmation({
        type: "swap",
        status: "pending_approval",
        targetEmpId: "emp-2",
      }),
    ).toEqual({});
    expect(
      describeCancelRequestConfirmation({ type: "calloff", status: "open", targetEmpId: null }),
    ).toEqual({});
  });
});
