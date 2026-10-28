import { describe, expect, it } from "vitest";
import {
  bulkStatusDone,
  bulkStatusSkipReason,
  describeBulkStatusAction,
  planBulkStatusChange,
  SELF_STATUS_SKIP_REASON,
  type BulkStatusPerson,
} from "./bulk-status";
import {
  NO_ACCOUNT_MESSAGE,
  NOT_ON_SCHEDULE_MESSAGE,
  NOT_SUSPENDABLE_MESSAGE,
  OFFBOARD_OUT_OF_REACH_MESSAGE,
  RESTORE_OUT_OF_REACH_MESSAGE,
} from "./employment-status";

function person(overrides: Partial<BulkStatusPerson> = {}): BulkStatusPerson {
  return {
    name: "Jamie Rivera",
    status: "active",
    userId: "user-1",
    focusAreaIds: [1],
    ...overrides,
  };
}

const active = person();
const away = person({ status: "inactive" });
const suspended = person({ suspendedAt: "2026-10-01T00:00:00Z" });
const offboarded = person({ status: "removed", archivedAt: "2026-10-01T00:00:00Z" });

describe("bulkStatusSkipReason", () => {
  it("lets each change reach the people it moves", () => {
    expect(bulkStatusSkipReason("markAway", active)).toBeNull();
    expect(bulkStatusSkipReason("suspend", active)).toBeNull();
    expect(bulkStatusSkipReason("archive", active)).toBeNull();
    expect(bulkStatusSkipReason("markActive", away)).toBeNull();
    expect(bulkStatusSkipReason("reinstate", suspended)).toBeNull();
    expect(bulkStatusSkipReason("restore", offboarded)).toBeNull();
    expect(bulkStatusSkipReason("archive", suspended)).toBeNull();
    expect(bulkStatusSkipReason("markAway", suspended)).toBeNull();
  });

  it("skips someone with a return planned, whose plan is edited on their page (51l)", () => {
    const returning = {
      ...offboarded,
      plannedStatus: "active" as const,
      plannedFrom: "2026-11-10",
    };
    expect(bulkStatusSkipReason("restore", returning)).toBe(
      "Returns Tue, Nov 10. Change it with Edit plan.",
    );
  });

  it("skips a Super Admin the manager can't offboard or restore (51k)", () => {
    expect(bulkStatusSkipReason("archive", active, { canOffboard: false })).toBe(
      OFFBOARD_OUT_OF_REACH_MESSAGE,
    );
    expect(bulkStatusSkipReason("restore", offboarded, { canOffboard: false })).toBe(
      RESTORE_OUT_OF_REACH_MESSAGE,
    );
    expect(bulkStatusSkipReason("suspend", active, { canOffboard: false })).toBeNull();
    expect(bulkStatusSkipReason("markActive", away, { canOffboard: false })).toBeNull();
    const plan = planBulkStatusChange(
      "archive",
      [active, person({ name: "Sam Super" })],
      () => false,
      (candidate) => candidate.name !== "Sam Super",
    );
    expect(plan.eligible.map((candidate) => candidate.name)).toEqual(["Jamie Rivera"]);
    expect(plan.skipped).toEqual([
      {
        person: expect.objectContaining({ name: "Sam Super" }),
        reason: OFFBOARD_OUT_OF_REACH_MESSAGE,
      },
    ]);
  });

  it("skips someone already in that status", () => {
    expect(bulkStatusSkipReason("markAway", away)).toBe("Already Away.");
    expect(bulkStatusSkipReason("suspend", suspended)).toBe("Already Suspended.");
    expect(bulkStatusSkipReason("archive", offboarded)).toBe("Already Offboarded.");
    expect(bulkStatusSkipReason("markActive", active)).toBe("Already Active.");
    expect(bulkStatusSkipReason("restore", active)).toBe("Already Active.");
  });

  it("brings back only the status each way back starts from", () => {
    expect(bulkStatusSkipReason("markActive", suspended)).toBe(
      "Only someone who is away can be marked active.",
    );
    expect(bulkStatusSkipReason("reinstate", offboarded)).toBe(
      "Only someone who is suspended can be reinstated.",
    );
    expect(bulkStatusSkipReason("restore", away)).toBe("Only someone offboarded can be restored.");
  });

  it("uses Change status's reasons", () => {
    expect(bulkStatusSkipReason("suspend", person({ userId: null }))).toBe(NO_ACCOUNT_MESSAGE);
    expect(bulkStatusSkipReason("suspend", away)).toBe(NOT_SUSPENDABLE_MESSAGE);
    expect(bulkStatusSkipReason("markAway", person({ focusAreaIds: [] }))).toBe(
      NOT_ON_SCHEDULE_MESSAGE,
    );
    expect(
      bulkStatusSkipReason(
        "markAway",
        person({ plannedStatus: "away", plannedFrom: "2026-11-10" }),
      ),
    ).toBe("Planned from Tue, Nov 10. Change it with Edit plan.");
    expect(
      bulkStatusSkipReason(
        "archive",
        person({ plannedStatus: "removed", plannedFrom: "2026-11-09" }),
      ),
    ).toBe("Leaving Sun, Nov 8. Change it with Edit plan.");
  });

  it("skips the manager's own row before anything else", () => {
    expect(bulkStatusSkipReason("markAway", active, { isSelf: true })).toBe(
      SELF_STATUS_SKIP_REASON,
    );
    expect(bulkStatusSkipReason("markAway", away, { isSelf: true })).toBe(SELF_STATUS_SKIP_REASON);
  });
});

describe("planBulkStatusChange", () => {
  it("splits a selection into who it reaches and who it skips, in order", () => {
    const me = person({ name: "Me", userId: "me" });
    const noAccount = person({ name: "No Account", userId: null });
    const plan = planBulkStatusChange(
      "suspend",
      [active, me, noAccount, suspended],
      (p) => p.userId === "me",
    );
    expect(plan.eligible).toEqual([active]);
    expect(plan.skipped.map((skip) => [skip.person.name, skip.reason])).toEqual([
      ["Me", SELF_STATUS_SKIP_REASON],
      ["No Account", NO_ACCOUNT_MESSAGE],
      ["Jamie Rivera", "Already Suspended."],
    ]);
  });
});

describe("describeBulkStatusAction", () => {
  it("counts several people and says how many done", () => {
    const copy = describeBulkStatusAction("markAway", [active, active, active]);
    expect(copy.title).toBe("Mark 3 people away?");
    expect(copy.label).toBe("Mark away");
    expect(copy.unchanged).toEqual(["They can still sign in and keep their roles."]);
    expect(copy.done).toBe("3 people marked away");
    expect(describeBulkStatusAction("archive", [active, active]).done).toBe("2 people offboarded");
  });

  it("carries a shared return date", () => {
    const copy = describeBulkStatusAction("markAway", [active, active], {
      returnDate: "2027-01-04",
    });
    expect(copy.message).toBe(
      "They won't be scheduled before Mon, Jan 4, when they're back to Active.",
    );
    expect(copy.points).toContain("Recurring schedules pause and fill again from Jan 4.");
  });

  it("counts the planned changes it cancels", () => {
    const planned = person({ plannedStatus: "suspended", plannedFrom: "2026-11-10" });
    expect(describeBulkStatusAction("archive", [active, planned]).points).toContain(
      "The change planned for 1 of them is cancelled.",
    );
    expect(describeBulkStatusAction("markAway", [planned, planned, active]).points).toContain(
      "Changes planned for 2 of them are cancelled.",
    );
    expect(describeBulkStatusAction("restore", [offboarded, offboarded]).points).toEqual([]);
  });

  it("says nothing of sign-in when nobody has an account", () => {
    const noAccount = person({ userId: null });
    const copy = describeBulkStatusAction("archive", [noAccount, noAccount]);
    expect([copy.message, ...copy.points, ...copy.unchanged].join(" ")).not.toMatch(/sign in/i);
  });

  it("reads as the person page for one person", () => {
    const copy = describeBulkStatusAction("archive", [
      person({ userId: null, plannedStatus: "away", plannedFrom: "2099-01-05" }),
    ]);
    expect(copy.title).toBe("Offboard Jamie Rivera?");
    expect(copy.points).toContain("The away planned from Jan 5 is cancelled.");
    expect(copy.done).toBe("Offboarded");
  });
});

describe("bulkStatusDone", () => {
  it("counts who changed", () => {
    expect(bulkStatusDone("suspend", 1)).toBe("1 person suspended");
    expect(bulkStatusDone("markActive", 4)).toBe("4 people marked active");
    expect(bulkStatusDone("restore", 2)).toBe("2 people restored");
  });
});
