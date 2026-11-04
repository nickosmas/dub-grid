import { describe, expect, it } from "vitest";
import { describeApprovalDraftWarning, toShiftRequestDraftCell } from "./approval-draft-warning";

const swap = {
  requesterEmpId: "emp-1",
  requesterName: "Laura Marshall",
  targetEmpId: "emp-2",
  targetName: "Jane Morgan",
};

const pickup = {
  requesterEmpId: "emp-1",
  requesterName: "Laura Marshall",
  targetEmpId: null,
  targetName: null,
};

const REPLACES = "Approving publishes this request now and replaces them.";

describe("describeApprovalDraftWarning", () => {
  it("says nothing when no day has unpublished changes", () => {
    expect(describeApprovalDraftWarning(swap, [])).toEqual([]);
  });

  it("names the one person and day", () => {
    expect(describeApprovalDraftWarning(pickup, [{ empId: "emp-1", date: "2026-10-28" }])).toEqual([
      "Laura Marshall has unpublished changes on Wed, Oct 28.",
      REPLACES,
    ]);
  });

  it("gives each person their own line, requester first, days in order", () => {
    expect(
      describeApprovalDraftWarning(swap, [
        { empId: "emp-2", date: "2026-10-30" },
        { empId: "emp-1", date: "2026-10-30" },
        { empId: "emp-1", date: "2026-10-28" },
        { empId: "emp-2", date: "2026-10-28" },
      ]),
    ).toEqual([
      "Laura Marshall has unpublished changes on Wed, Oct 28 and Fri, Oct 30.",
      "Jane Morgan has unpublished changes on Wed, Oct 28 and Fri, Oct 30.",
      REPLACES,
    ]);
  });

  it("names only the person whose day changed on a same-day swap", () => {
    expect(describeApprovalDraftWarning(swap, [{ empId: "emp-2", date: "2026-10-28" }])).toEqual([
      "Jane Morgan has unpublished changes on Wed, Oct 28.",
      REPLACES,
    ]);
  });

  it("keeps the calendar day whatever the reader's time zone", () => {
    expect(describeApprovalDraftWarning(pickup, [{ empId: "emp-1", date: "2027-01-01" }])[0]).toBe(
      "Laura Marshall has unpublished changes on Fri, Jan 1.",
    );
  });

  it("names draft notes when a day has only those", () => {
    expect(
      describeApprovalDraftWarning(pickup, [
        { empId: "emp-1", date: "2026-10-28", hasShiftChanges: false, hasNoteChanges: true },
      ]),
    ).toEqual(["Laura Marshall has unpublished notes on Wed, Oct 28.", REPLACES]);
  });

  it("names both when every day has both", () => {
    expect(
      describeApprovalDraftWarning(pickup, [
        { empId: "emp-1", date: "2026-10-28", hasShiftChanges: true, hasNoteChanges: true },
      ]),
    ).toEqual(["Laura Marshall has unpublished changes and notes on Wed, Oct 28.", REPLACES]);
  });

  it("says changes or notes when the days hold one or the other", () => {
    expect(
      describeApprovalDraftWarning(swap, [
        { empId: "emp-1", date: "2026-10-30", hasShiftChanges: false, hasNoteChanges: true },
        { empId: "emp-1", date: "2026-10-28", hasShiftChanges: true, hasNoteChanges: false },
        { empId: "emp-2", date: "2026-10-28", hasShiftChanges: true, hasNoteChanges: false },
      ]),
    ).toEqual([
      "Laura Marshall has unpublished changes or notes on Wed, Oct 28 and Fri, Oct 30.",
      "Jane Morgan has unpublished changes on Wed, Oct 28.",
      REPLACES,
    ]);
  });

  it("reads a day from an older server, with no kinds, as unpublished changes", () => {
    expect(describeApprovalDraftWarning(pickup, [{ empId: "emp-1", date: "2026-10-28" }])[0]).toBe(
      "Laura Marshall has unpublished changes on Wed, Oct 28.",
    );
  });

  it("still warns when the check failed", () => {
    expect(describeApprovalDraftWarning(swap, null)).toEqual([
      "These days couldn't be checked for unpublished changes or notes. Approving publishes this request now and replaces any there are.",
    ]);
  });
});

describe("toShiftRequestDraftCell", () => {
  it("keeps which kind of change the day holds", () => {
    expect(
      toShiftRequestDraftCell({
        emp_id: "emp-1",
        shift_date: "2026-10-28",
        has_shift_changes: false,
        has_note_changes: true,
      }),
    ).toEqual({ empId: "emp-1", date: "2026-10-28", hasShiftChanges: false, hasNoteChanges: true });
  });

  it("leaves the kinds out for a row from before 119", () => {
    expect(toShiftRequestDraftCell({ emp_id: "emp-1", shift_date: "2026-10-28" })).toEqual({
      empId: "emp-1",
      date: "2026-10-28",
    });
  });
});
