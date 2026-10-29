import { describe, expect, it } from "vitest";
import {
  changedDayKeys,
  describeOrgPublishChanges,
  describeOwnPublishChanges,
  describePublishNotice,
  formatDayLabel,
  ownPublishChanges,
} from "@/lib/publish-notice";

type Change = Parameters<typeof describeOrgPublishChanges>[0][number];

const change = (overrides: Partial<Change> = {}): Change => ({
  empId: "me",
  date: "2026-11-03",
  kind: "modified",
  ...overrides,
});

describe("formatDayLabel", () => {
  it("names the weekday and date", () => {
    expect(formatDayLabel("2026-11-03")).toBe("Tue, Nov 3");
  });
});

describe("ownPublishChanges", () => {
  it("keeps only the viewer's cells and skips a first publication", () => {
    const mine = change();
    const changes = [
      mine,
      change({ empId: "someone-else" }),
      change({ kind: "new", isNewAddition: false, date: "2026-11-04" }),
    ];
    expect(ownPublishChanges(changes, "me")).toEqual([mine]);
  });

  it("keeps a shift added after the first publication", () => {
    const added = change({ kind: "new", isNewAddition: true });
    expect(ownPublishChanges([added], "me")).toEqual([added]);
  });

  it("returns nothing without a staff row", () => {
    expect(ownPublishChanges([change()], null)).toEqual([]);
  });
});

describe("changedDayKeys", () => {
  it("lists each day once, in order", () => {
    expect(
      changedDayKeys([
        change({ date: "2026-11-05" }),
        change({ date: "2026-11-03" }),
        change({ date: "2026-11-05", kind: "deleted" }),
      ]),
    ).toEqual(["2026-11-03", "2026-11-05"]);
  });
});

describe("describeOwnPublishChanges", () => {
  it("names one day", () => {
    expect(describeOwnPublishChanges([change()], "me")).toBe("Your shifts changed on Tue, Nov 3");
  });

  it("joins two days with and", () => {
    expect(
      describeOwnPublishChanges([change(), change({ date: "2026-11-05", kind: "deleted" })], "me"),
    ).toBe("Your shifts changed on Tue, Nov 3 and Thu, Nov 5");
  });

  it("counts the days past three", () => {
    const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    expect(
      describeOwnPublishChanges(
        dates.map((date) => change({ date })),
        "me",
      ),
    ).toBe("Your shifts changed on Mon, Nov 2, Tue, Nov 3, Wed, Nov 4 and 2 more days");
  });

  it("says nothing when only other people's shifts changed", () => {
    expect(describeOwnPublishChanges([change({ empId: "someone-else" })], "me")).toBeNull();
  });
});

describe("describeOrgPublishChanges", () => {
  it("counts every kind and says changed, not modified", () => {
    expect(
      describeOrgPublishChanges([
        change({ kind: "new" }),
        change({ kind: "modified", empId: "a" }),
        change({ kind: "modified", empId: "b" }),
        change({ kind: "deleted", empId: "c" }),
      ]),
    ).toBe("4 shifts changed since your last visit: 1 new, 2 changed, 1 removed");
  });

  it("uses the singular for one shift", () => {
    expect(describeOrgPublishChanges([change({ kind: "deleted" })])).toBe(
      "1 shift changed since your last visit: 1 removed",
    );
  });

  it("is empty with no changes", () => {
    expect(describeOrgPublishChanges([])).toBeNull();
  });
});

describe("describePublishNotice", () => {
  const changes = [change({ empId: "someone-else" }), change({ date: "2026-11-05" })];

  it("gives an editor the organization's count", () => {
    expect(describePublishNotice(changes, { seesOrgChanges: true, empId: "me" })).toBe(
      "2 shifts changed since your last visit: 2 changed",
    );
  });

  it("gives staff only their own days", () => {
    expect(describePublishNotice(changes, { seesOrgChanges: false, empId: "me" })).toBe(
      "Your shifts changed on Thu, Nov 5",
    );
  });
});
