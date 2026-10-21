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

  describe("approving over unpublished changes", () => {
    const approve = { action: "resolve", approved: true };
    const pickup = {
      type: "pickup" as const,
      status: "pending_approval" as const,
      requesterEmpId: "emp-1",
      requesterName: "Laura Marshall",
      targetEmpId: "emp-2",
      targetName: "Jane Morgan",
    };

    it("names each person's changed days before approving", () => {
      const feedback = getMobileRequestActionFeedback({
        requestId: "r1",
        body: approve,
        request: { ...pickup, draftCells: [{ empId: "emp-2", date: "2026-10-28" }] },
      });

      expect(feedback.warning).toEqual([
        "Jane Morgan has unpublished changes on Wed, Oct 28.",
        "Approving publishes this request now and replaces those changes.",
      ]);
    });

    it("still warns when the check failed", () => {
      const feedback = getMobileRequestActionFeedback({
        requestId: "r1",
        body: approve,
        request: { ...pickup, draftCells: null },
      });

      expect(feedback.warning?.[0]).toBe(
        "These days couldn't be checked for unpublished changes. Approving publishes this request now and replaces any there are.",
      );
    });

    it("says nothing when nothing would be replaced, or nothing was checked", () => {
      for (const request of [{ ...pickup, draftCells: [] }, pickup]) {
        expect(
          getMobileRequestActionFeedback({ requestId: "r1", body: approve, request }).warning,
        ).toEqual([]);
      }
    });

    it("never warns on a rejection", () => {
      const feedback = getMobileRequestActionFeedback({
        requestId: "r1",
        body: { action: "resolve", approved: false },
        request: { ...pickup, draftCells: [{ empId: "emp-2", date: "2026-10-28" }] },
      });

      expect(feedback.warning).toBeUndefined();
    });
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
