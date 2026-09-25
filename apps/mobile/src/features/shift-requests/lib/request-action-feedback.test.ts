import { describe, expect, it } from "vitest";
import {
  getMobileRequestActionFeedback,
  getMobileRequestActionSuccessToast,
} from "./request-action-feedback";

describe("getMobileRequestActionFeedback", () => {
  it("promises a queue to a member and the schedule to an approver", () => {
    const body = { action: "claim" };
    expect(getMobileRequestActionFeedback({ requestId: "r1", body }).message).toBe(
      "Claim this open shift? We'll send it to your admin for approval.",
    );
    expect(
      getMobileRequestActionFeedback({ requestId: "r1", body, viewerCanApprove: true }).message,
    ).toBe("Claim this open shift? As an admin, this goes on the schedule right away.");
    expect(
      getMobileRequestActionFeedback({
        requestId: "r1",
        body: { action: "volunteer_open_shift" },
        viewerCanApprove: true,
      }).message,
    ).toBe("Claim this open shift? As an admin, this goes on the schedule right away.");
  });
});

describe("getMobileRequestActionSuccessToast", () => {
  it("keeps the pending copy unless the server settled the request", () => {
    expect(getMobileRequestActionSuccessToast({ action: "claim" })).toEqual({
      title: "Claim request sent",
      message: "Your shift is pending approval.",
    });
    expect(getMobileRequestActionSuccessToast({ action: "claim" }, { autoApproved: true })).toEqual(
      { title: "Shift is yours", message: "The claim was approved and is on the schedule." },
    );
    expect(
      getMobileRequestActionSuccessToast(
        { action: "respond", accept: true },
        { autoApproved: true },
      ),
    ).toEqual({ title: "Swap approved", message: "Both schedules are updated." });
    expect(getMobileRequestActionSuccessToast({ action: "respond", accept: false })).toEqual({
      title: "Request declined",
      message: "Your response was sent.",
    });
  });
});
