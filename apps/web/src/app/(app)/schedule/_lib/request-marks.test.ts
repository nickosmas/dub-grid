import { describe, expect, it } from "vitest";
import type { ScheduleCellState, ShiftRequest } from "@/types";
import { buildRequestMarks, foldWaitingOn } from "./request-marks";

const DAY: ScheduleCellState = {
  kind: "worked",
  segments: [{ shiftId: 5, jobId: 8, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
};
const EVENING: ScheduleCellState = { ...DAY, segments: [{ shiftId: 6, jobId: 8, position: 0 }] };

function request(overrides: Partial<ShiftRequest>): ShiftRequest {
  return {
    id: "req-1",
    orgId: "org-1",
    type: "pickup",
    status: "open",
    requesterEmpId: "laura",
    requesterName: "Laura Marshall",
    requesterShiftDate: "2026-11-19",
    requesterState: DAY,
    requesterAssignmentDefinitionIds: [21],
    requesterShiftLabel: "Day Shift",
    requesterFocusAreaId: 11,
    requesterCustomStartTime: null,
    requesterCustomEndTime: null,
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetState: null,
    targetAssignmentDefinitionIds: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: "2026-11-17T08:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-11-14T16:02:00.000Z",
    updatedAt: "2026-11-14T16:02:00.000Z",
    ...overrides,
  };
}

const cell = (marks: ReturnType<typeof buildRequestMarks>, key: string) => marks.byCell.get(key);

describe("buildRequestMarks", () => {
  it("marks an unclaimed offer on the asker's shift, waiting for a teammate", () => {
    const marks = buildRequestMarks([request({})]);
    expect(cell(marks, "laura_2026-11-19")).toEqual([
      { requestId: "req-1", type: "pickup", role: "asker", waitingOn: "teammate", wouldGet: null },
    ]);
    expect(marks.byCell.size).toBe(1);
  });

  it("marks a claimed offer on both days, with the shift the claimer would get", () => {
    const marks = buildRequestMarks([
      request({
        status: "pending_approval",
        targetEmpId: "thomas",
        targetShiftDate: "2026-11-19",
      }),
    ]);
    expect(cell(marks, "laura_2026-11-19")?.[0]).toMatchObject({
      role: "asker",
      waitingOn: "manager",
    });
    expect(cell(marks, "thomas_2026-11-19")?.[0]).toMatchObject({
      role: "claimer",
      waitingOn: "manager",
      wouldGet: DAY,
    });
  });

  it("marks a named pickup on the teammate's day, waiting for them and then a manager", () => {
    const asked = buildRequestMarks([
      request({ targetEmpId: "thomas", targetShiftDate: "2026-11-19", absenceTypeId: 4 }),
    ]);
    expect(cell(asked, "thomas_2026-11-19")?.[0]).toMatchObject({
      role: "partner",
      waitingOn: "teammate",
    });
    const accepted = buildRequestMarks([
      request({
        status: "pending_approval",
        targetEmpId: "thomas",
        targetShiftDate: "2026-11-19",
        absenceTypeId: 4,
      }),
    ]);
    expect(cell(accepted, "laura_2026-11-19")?.[0].waitingOn).toBe("manager");
    expect(cell(accepted, "thomas_2026-11-19")?.[0]).toMatchObject({
      role: "partner",
      waitingOn: "manager",
    });
  });

  it("marks a volunteer's day with the open shift they would get", () => {
    const marks = buildRequestMarks([
      request({ status: "pending_approval", requesterEmpId: "thomas" }),
    ]);
    expect(cell(marks, "thomas_2026-11-19")).toEqual([
      {
        requestId: "req-1",
        type: "pickup",
        role: "volunteer",
        waitingOn: "manager",
        wouldGet: DAY,
      },
    ]);
  });

  it("marks both sides of a swap, across two dates", () => {
    const marks = buildRequestMarks([
      request({
        type: "swap",
        requesterEmpId: "diane",
        requesterShiftDate: "2026-11-17",
        targetEmpId: "carol",
        targetShiftDate: "2026-11-19",
        targetState: EVENING,
      }),
    ]);
    expect(cell(marks, "diane_2026-11-17")?.[0]).toMatchObject({
      role: "asker",
      waitingOn: "teammate",
      wouldGet: EVENING,
    });
    expect(cell(marks, "carol_2026-11-19")?.[0]).toMatchObject({
      role: "partner",
      waitingOn: "teammate",
      wouldGet: DAY,
    });
  });

  it("marks a call-off on the asker's shift, waiting for a manager", () => {
    const marks = buildRequestMarks([
      request({ type: "calloff", status: "pending_approval", absenceTypeId: 9 }),
    ]);
    expect(cell(marks, "laura_2026-11-19")?.[0]).toMatchObject({
      type: "calloff",
      role: "asker",
      waitingOn: "manager",
    });
  });

  it("marks a claimed call-off open shift in the Open shifts row and on the claimer's day", () => {
    const unclaimed = buildRequestMarks([request({ id: "open-1", parentRequestId: "call-1" })]);
    expect(unclaimed.byOpenShift.size).toBe(0);
    expect(unclaimed.byCell.size).toBe(0);

    const claimed = buildRequestMarks([
      request({
        id: "open-1",
        parentRequestId: "call-1",
        status: "pending_approval",
        targetEmpId: "thomas",
        targetShiftDate: "2026-11-19",
      }),
    ]);
    expect(claimed.byOpenShift.get("open-1")).toMatchObject({
      role: "open-shift",
      waitingOn: "manager",
    });
    expect(cell(claimed, "thomas_2026-11-19")?.[0]).toMatchObject({
      role: "claimer",
      wouldGet: DAY,
    });
    // The caller's day already shows the call-off; the open shift is not theirs.
    expect(cell(claimed, "laura_2026-11-19")).toBeUndefined();
  });

  it("leaves settled requests unmarked", () => {
    const marks = buildRequestMarks(
      (["approved", "rejected", "cancelled", "expired"] as const).map((status, index) =>
        request({ id: `req-${index}`, status, targetEmpId: "thomas" }),
      ),
    );
    expect(marks.byCell.size).toBe(0);
    expect(marks.byOpenShift.size).toBe(0);
  });

  it("draws nothing from an empty request list", () => {
    const marks = buildRequestMarks([]);
    expect(marks.byCell.size).toBe(0);
    expect(foldWaitingOn(marks.byCell.get("laura_2026-11-19"))).toBeNull();
  });

  it("lists every request on a shared day and lets a manager's turn win the fold", () => {
    const marks = buildRequestMarks([
      request({ id: "offer" }),
      request({
        id: "swap",
        type: "swap",
        status: "pending_approval",
        targetEmpId: "carol",
        targetShiftDate: "2026-11-19",
        targetState: EVENING,
      }),
    ]);
    const list = cell(marks, "laura_2026-11-19");
    expect(list?.map((mark) => mark.requestId)).toEqual(["swap", "offer"]);
    expect(foldWaitingOn(list)).toBe("manager");
    expect(foldWaitingOn(cell(buildRequestMarks([request({})]), "laura_2026-11-19"))).toBe(
      "teammate",
    );
  });
});
