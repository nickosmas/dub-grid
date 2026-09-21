import { describe, expect, it } from "vitest";
import {
  describeAwaitingRecipient,
  describeCancelAwaitingRecipientCaution,
  groupManagerQueue,
  isAwaitingRecipient,
  describeShiftRequest,
  describeShiftRequestNoteRecipients,
  describeShiftRequestPill,
} from "./shift-request-copy";

const swap = {
  type: "swap" as const,
  requesterEmpId: "emp-1",
  requesterName: "Laura Marshall",
  targetEmpId: "emp-2",
  targetName: "Jane Morgan",
};

describe("describeShiftRequest", () => {
  it("names who asked whom on a swap seen by a third person", () => {
    expect(describeShiftRequest(swap, "emp-9")).toEqual({
      title: "Laura Marshall",
      subtitle: "Asked Jane Morgan to swap shifts",
      requesterShiftLabel: "Laura Marshall's shift",
      targetShiftLabel: "Jane Morgan's shift",
    });
  });

  it("says you when the viewer is the target", () => {
    expect(describeShiftRequest(swap, "emp-2")).toMatchObject({
      title: "Laura Marshall",
      subtitle: "Asked you to swap shifts",
      targetShiftLabel: "Your shift",
    });
  });

  it("says You when the viewer made the request", () => {
    expect(describeShiftRequest(swap, "emp-1")).toMatchObject({
      title: "You",
      subtitle: "Asked Jane Morgan to swap shifts",
      requesterShiftLabel: "Your shift",
    });
  });

  it("describes pickups and time off", () => {
    expect(
      describeShiftRequest({ ...swap, type: "pickup", targetEmpId: null, targetName: null }, null),
    ).toMatchObject({ subtitle: "Offered this shift for pickup", targetShiftLabel: null });
    expect(describeShiftRequest({ ...swap, type: "pickup" }, "emp-2").subtitle).toBe(
      "Offered to cover your shift",
    );
    expect(describeShiftRequest({ ...swap, type: "calloff" }, null).subtitle).toBe(
      "Asked for time off",
    );
  });

  it("keeps a trailing s possessive readable", () => {
    expect(
      describeShiftRequest({ ...swap, requesterName: "Thomas Andrews" }, null).requesterShiftLabel,
    ).toBe("Thomas Andrews' shift");
  });
});

describe("describeShiftRequestPill", () => {
  it("names the kind while open", () => {
    expect(describeShiftRequestPill("swap", "open")).toEqual({
      label: "Swap request",
      tone: "kind",
    });
    expect(describeShiftRequestPill("calloff", "open").label).toBe("Time off request");
  });

  it("folds the status into the same pill once the request is not open", () => {
    expect(describeShiftRequestPill("swap", "pending_approval")).toEqual({
      label: "Swap · Pending approval",
      tone: "pending",
    });
    expect(describeShiftRequestPill("pickup", "approved")).toEqual({
      label: "Pickup · Approved",
      tone: "approved",
    });
    expect(describeShiftRequestPill("calloff", "rejected").tone).toBe("closed");
    expect(describeShiftRequestPill("swap", "expired").label).toBe("Swap · Expired");
  });
});

describe("describeShiftRequestNoteRecipients", () => {
  it("names both people on a swap and only the requester otherwise", () => {
    expect(describeShiftRequestNoteRecipients(swap)).toBe("Laura and Jane");
    expect(describeShiftRequestNoteRecipients({ ...swap, targetName: null })).toBe("Laura");
  });
});

describe("awaiting-recipient requests", () => {
  it("is an open request aimed at one person", () => {
    expect(isAwaitingRecipient({ type: "swap", status: "open", targetEmpId: "e2" })).toBe(true);
    expect(isAwaitingRecipient({ type: "pickup", status: "open", targetEmpId: "e2" })).toBe(true);
    expect(isAwaitingRecipient({ type: "pickup", status: "open", targetEmpId: null })).toBe(false);
    expect(
      isAwaitingRecipient({ type: "swap", status: "pending_approval", targetEmpId: "e2" }),
    ).toBe(false);
  });

  it("names the recipient by first name", () => {
    expect(describeAwaitingRecipient("Jane Morgan")).toBe("Waiting for Jane to respond");
    expect(
      describeCancelAwaitingRecipientCaution({ type: "swap", targetName: "Jane Morgan" }),
    ).toBe(
      "Jane hasn't responded to this swap yet. Cancelling withdraws it for both people and the schedule stays as it is.",
    );
    expect(describeCancelAwaitingRecipientCaution({ type: "pickup", targetName: null })).toMatch(
      /^The other person hasn't responded to this pickup yet/,
    );
  });
});

describe("groupManagerQueue", () => {
  it("splits the queue by what each request waits on and drops empty groups", () => {
    const groups = groupManagerQueue([
      { id: 1, type: "swap", status: "open", targetEmpId: "e2" },
      { id: 2, type: "pickup", status: "open", targetEmpId: null },
      { id: 3, type: "calloff", status: "pending_approval", targetEmpId: null },
      { id: 4, type: "swap", status: "pending_approval", targetEmpId: "e2" },
      { id: 5, type: "swap", status: "approved", targetEmpId: "e2" },
    ] as const);
    expect(
      groups.map((group) => [group.key, group.label, group.requests.map((r) => r.id)]),
    ).toEqual([
      ["pending_approval", "Pending approval", [3, 4]],
      ["pickups", "Pickups", [2]],
      ["awaiting_recipient", "Swaps awaiting a response", [1]],
    ]);
    expect(groupManagerQueue([])).toEqual([]);
  });
});
