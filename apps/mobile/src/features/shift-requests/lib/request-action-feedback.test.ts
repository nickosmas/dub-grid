import { describe, expect, it } from "vitest";
import {
  getMobileRequestActionFeedback,
  getMobileRequestActionSuccessToast,
} from "./request-action-feedback";

describe("getMobileRequestActionFeedback", () => {
  it("promises a queue to a member and the schedule to an approver", () => {
    const body = { action: "claim" };
    const calloffPickup = {
      type: "pickup" as const,
      status: "open" as const,
      targetEmpId: null,
      targetName: null,
      parentRequestId: "calloff-1",
    };
    expect(
      getMobileRequestActionFeedback({ requestId: "r1", body, request: calloffPickup }).message,
    ).toBe("It's sent for approval.");
    expect(
      getMobileRequestActionFeedback({
        requestId: "r1",
        body: { action: "volunteer_open_shift" },
      }).message,
    ).toBe("It's sent for approval.");
    expect(
      getMobileRequestActionFeedback({ requestId: "r1", body, viewerCanApprove: true }).message,
    ).toBe("You can approve requests, so it goes on the schedule right away.");
    expect(
      getMobileRequestActionFeedback({
        requestId: "r1",
        body: { action: "volunteer_open_shift" },
        viewerCanApprove: true,
      }).message,
    ).toBe("You can approve requests, so it goes on the schedule right away.");
  });

  it("allows for a poster who can approve an ordinary pickup", () => {
    const ordinaryPickup = {
      type: "pickup" as const,
      status: "open" as const,
      targetEmpId: null,
      targetName: null,
      parentRequestId: null,
    };
    const expected =
      "It goes on the schedule once it's approved, right away if whoever posted it can approve requests.";
    expect(
      getMobileRequestActionFeedback({
        requestId: "r1",
        body: { action: "claim" },
        request: ordinaryPickup,
      }).message,
    ).toBe(expected);
    // Without the request in hand, the hedged sentence is the one that is always true.
    expect(
      getMobileRequestActionFeedback({ requestId: "r1", body: { action: "claim" } }).message,
    ).toBe(expected);
  });

  it("says a decline closes the request", () => {
    expect(
      getMobileRequestActionFeedback({
        requestId: "r1",
        body: { action: "respond", accept: false },
      }).message,
    ).toBe("The request closes and the requester keeps their shift.");
  });

  it("cautions that the other person hasn't answered when a cancel goes over their head", () => {
    const feedback = getMobileRequestActionFeedback({
      requestId: "r1",
      body: { action: "cancel" },
      request: {
        type: "swap",
        status: "open",
        targetEmpId: "emp-2",
        targetName: "Laura Marshall",
      },
    });

    expect(feedback.message).toBe(
      "The other person hasn't responded to this swap yet. Cancelling withdraws it for both people and the schedule stays as it is.",
    );
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
  });

  it("names the answered request's real type", () => {
    const accept = { action: "respond", accept: true };
    const decline = { action: "respond", accept: false };
    expect(getMobileRequestActionSuccessToast(accept, { autoApproved: true }, "swap")).toEqual({
      title: "Swap approved",
      message: "Both schedules are updated.",
    });
    expect(getMobileRequestActionSuccessToast(accept, { autoApproved: true }, "pickup")).toEqual({
      title: "Pickup approved",
      message: "The shift is on your schedule.",
    });
    expect(getMobileRequestActionSuccessToast(accept, { autoApproved: true })).toEqual({
      title: "Request approved",
      message: "The schedule is updated.",
    });
    expect(getMobileRequestActionSuccessToast(decline, undefined, "pickup")).toEqual({
      title: "Pickup declined",
      message: "They'll see your answer.",
    });
    expect(getMobileRequestActionSuccessToast(decline, undefined, "swap").title).toBe(
      "Swap declined",
    );
    expect(getMobileRequestActionSuccessToast(decline).title).toBe("Request declined");
  });
});
