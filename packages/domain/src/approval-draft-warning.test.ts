import { describe, expect, it } from "vitest";
import { describeApprovalDraftWarning } from "./approval-draft-warning";

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

const REPLACES = "Approving publishes this request now and replaces those changes.";

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

  it("still warns when the check failed", () => {
    expect(describeApprovalDraftWarning(swap, null)).toEqual([
      "These days couldn't be checked for unpublished changes. Approving publishes this request now and replaces any there are.",
    ]);
  });
});
