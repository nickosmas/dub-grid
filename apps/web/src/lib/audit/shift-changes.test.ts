import { describe, expect, it, vi } from "vitest";
import type { ShiftChangeResolvers } from "@dubgrid/schedule-core";
import { shiftChangeForAuditRow, withShiftChanges } from "./shift-changes";

const resolvers: ShiftChangeResolvers = {
  segment: (shiftId) =>
    shiftId === 1
      ? {
          shiftName: "Day Shift",
          jobName: "Registered Nurse",
          focusAreaId: 5,
          defaultStart: "07:00",
          defaultEnd: "15:00",
        }
      : {
          shiftName: "Night Shift",
          jobName: "Registered Nurse",
          focusAreaId: 5,
          defaultStart: "23:00",
          defaultEnd: "07:00",
        },
  absenceType: () => ({ name: "Sick" }),
  focusArea: () => "Skilled Nursing",
};

const worked = (shiftId: number) => ({
  kind: "worked",
  segments: [{ shiftId, jobId: 7, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

const row = (action: string, details: Record<string, unknown>) => ({
  orgId: "org-1",
  action,
  resourceType: "shift",
  resourceId: "emp-1:2026-10-22",
  details,
});

const sides = (change: ReturnType<typeof shiftChangeForAuditRow>) => ({
  before: change?.before.items.map((item) => item.plain),
  after: change?.after.items.map((item) => item.plain),
});

describe("shiftChangeForAuditRow", () => {
  it("reads an edit as the cell before it and after it", () => {
    const change = shiftChangeForAuditRow(
      row("shift.updated", { before: worked(1), input: worked(2) }),
      resolvers,
    );
    expect(change?.date).toBe("2026-10-22");
    expect(sides(change)).toEqual({
      before: [expect.stringMatching(/^Day Shift · Registered Nurse/)],
      after: [expect.stringMatching(/^Night Shift · Registered Nurse/)],
    });
  });

  it("reads an addition against No shift and a removal as nothing after", () => {
    expect(
      sides(
        shiftChangeForAuditRow(row("shift.created", { before: null, input: worked(1) }), resolvers),
      ),
    ).toEqual({ before: [], after: [expect.stringMatching(/^Day Shift/)] });
    expect(
      sides(shiftChangeForAuditRow(row("shift.deleted", { before: worked(1) }), resolvers)),
    ).toEqual({ before: [expect.stringMatching(/^Day Shift/)], after: [] });
  });

  it("reads a move as the day it landed on", () => {
    const change = shiftChangeForAuditRow(
      row("shift.moved", {
        targetEmpId: "emp-2",
        targetDate: "2026-10-23",
        before: worked(1),
        targetBefore: worked(2),
        input: worked(1),
      }),
      resolvers,
    );
    expect(change?.date).toBe("2026-10-23");
    expect(sides(change)).toEqual({
      before: [expect.stringMatching(/^Night Shift/)],
      after: [expect.stringMatching(/^Day Shift/)],
    });
  });

  it("has nothing for a row saved before edits recorded their earlier state", () => {
    expect(
      shiftChangeForAuditRow(row("shift.updated", { input: worked(1) }), resolvers),
    ).toBeNull();
  });
});

describe("withShiftChanges", () => {
  it("loads each organization's names once and leaves other rows alone", async () => {
    const loadResolvers = vi.fn(async () => resolvers);
    const entries = await withShiftChanges(
      [
        row("shift.updated", { before: worked(1), input: worked(2) }),
        row("shift.deleted", { before: worked(2) }),
        { ...row("employee.updated", {}), resourceType: "employee" },
      ],
      loadResolvers,
    );

    expect(loadResolvers).toHaveBeenCalledTimes(1);
    expect(entries.map((entry) => entry.shiftChange?.kind ?? null)).toEqual([
      "single",
      "single",
      null,
    ]);
  });
});

describe("the activity table's summary of a recorded edit", () => {
  it("reads Before -> After and never lists the stored state's fields", async () => {
    const { formatDetails } = await import("@/lib/activity-log-utils");
    const removal = row("shift.deleted", { before: worked(1) });
    const shiftChange = shiftChangeForAuditRow(removal, resolvers);

    expect(formatDetails({ ...removal, shiftChange } as never)).toEqual([
      { label: "Change", value: expect.stringMatching(/^Day Shift .* → No shift$/) },
    ]);
    expect(formatDetails(removal as never)).toEqual([]);
  });
});
