import { describe, expect, it } from "vitest";
import {
  EMPLOYMENT_STATUS_LABELS,
  canMarkInactive,
  describeEmploymentStatus,
  describeStatusAction,
  formatReturnDate,
  isSchedulableOn,
  isValidReturnDate,
  statusUndoAction,
} from "./employment-status";

describe("isSchedulableOn", () => {
  it("schedules an active person on any day", () => {
    expect(isSchedulableOn({ status: "active" }, "2027-01-01")).toBe(true);
  });

  it("schedules someone Away until a date from that date on, and not before", () => {
    const away = { status: "inactive" as const, awayUntil: "2027-01-04" };
    expect(isSchedulableOn(away, "2027-01-03")).toBe(false);
    expect(isSchedulableOn(away, "2027-01-04")).toBe(true);
    expect(isSchedulableOn(away, "2027-01-10")).toBe(true);
  });

  it("never schedules someone Away without a date, or anyone archived", () => {
    expect(isSchedulableOn({ status: "inactive", awayUntil: null }, "2099-01-01")).toBe(false);
    expect(isSchedulableOn({ status: "removed" }, "2099-01-01")).toBe(false);
    expect(
      isSchedulableOn({ status: "active", archivedAt: "2026-01-01T00:00:00Z" }, "2027-01-01"),
    ).toBe(false);
  });
});

describe("isValidReturnDate", () => {
  it("takes a real day after today", () => {
    expect(isValidReturnDate("2027-01-04", "2027-01-03")).toBe(true);
    expect(isValidReturnDate("2028-02-29", "2027-01-03")).toBe(true);
  });

  it("refuses today, the past, a day that doesn't exist and anything not YYYY-MM-DD", () => {
    expect(isValidReturnDate("2027-01-03", "2027-01-03")).toBe(false);
    expect(isValidReturnDate("2026-12-31", "2027-01-03")).toBe(false);
    expect(isValidReturnDate("2027-02-29", "2027-01-03")).toBe(false);
    expect(isValidReturnDate("2027-1-4", "2027-01-03")).toBe(false);
    expect(isValidReturnDate("2027-01-04T00:00:00Z", "2027-01-03")).toBe(false);
  });
});

describe("canMarkInactive", () => {
  it("allows someone with a focus area", () => {
    expect(canMarkInactive([3])).toBe(true);
  });

  it("refuses someone with no focus area, such as a management-only person", () => {
    expect(canMarkInactive([])).toBe(false);
  });
});

describe("describeEmploymentStatus", () => {
  it("names each stored status the way people see it", () => {
    expect(describeEmploymentStatus("active")).toBe("Active");
    expect(describeEmploymentStatus("inactive")).toBe("Away");
    expect(describeEmploymentStatus("removed")).toBe("Archived");
  });

  it("names an Away person's return date, and only theirs", () => {
    expect(describeEmploymentStatus("inactive", "2027-01-04")).toBe("Away until Jan 4");
    expect(describeEmploymentStatus("inactive", null)).toBe("Away");
    expect(describeEmploymentStatus("active", "2027-01-04")).toBe("Active");
  });

  it("formats a return date as a short day, with the weekday on request", () => {
    expect(formatReturnDate("2027-01-04")).toBe("Jan 4");
    expect(formatReturnDate("2027-01-04", { weekday: true })).toBe("Mon, Jan 4");
  });

  it("reads an unknown or missing status as Active", () => {
    expect(describeEmploymentStatus("benched")).toBe(EMPLOYMENT_STATUS_LABELS.active);
    expect(describeEmploymentStatus(null)).toBe("Active");
    expect(describeEmploymentStatus(undefined)).toBe("Active");
  });
});

describe("statusUndoAction", () => {
  it("brings Away back with Mark active and Archived back with Restore", () => {
    expect(statusUndoAction("inactive")).toBe("markActive");
    expect(statusUndoAction("removed")).toBe("restore");
    expect(statusUndoAction("active")).toBeNull();
  });
});

describe("describeStatusAction", () => {
  it("names the person in each title and echoes the verb in the button", () => {
    expect(describeStatusAction("markAway", "Ana Torres")).toMatchObject({
      label: "Mark away",
      title: "Mark Ana Torres away?",
      done: "Marked away",
    });
    expect(describeStatusAction("archive", "Ana Torres")).toMatchObject({
      label: "Archive",
      title: "Archive Ana Torres?",
      done: "Archived",
    });
    expect(describeStatusAction("markActive", "Ana Torres")).toMatchObject({
      label: "Mark active",
      title: "Mark Ana Torres active?",
      done: "Marked active",
    });
    expect(describeStatusAction("restore", "Ana Torres")).toMatchObject({
      label: "Restore",
      title: "Restore Ana Torres?",
      done: "Restored",
    });
  });

  it("tells the manager that Away keeps sign-in and Archive ends it", () => {
    expect(describeStatusAction("markAway", "Ana").points[0]).toBe(
      "They can still sign in and keep their role.",
    );
    expect(describeStatusAction("archive", "Ana").points[0]).toBe("They can no longer sign in.");
  });

  it("keeps the box to two or more full sentences, or none", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const { points } = describeStatusAction(action, "Ana");
      // A box with one item reads oddly: a lone fact belongs in the message.
      expect(points.length === 0 || points.length >= 2).toBe(true);
      for (const point of points) expect(point).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("names the person only in the title", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const copy = describeStatusAction(action, "Ana Torres");
      expect(copy.title).toContain("Ana Torres");
      expect([copy.message, ...copy.points].join(" ")).not.toContain("Ana");
    }
  });

  it("doesn't open every point with the same word", () => {
    for (const action of ["markAway", "archive"] as const) {
      const firstWords = describeStatusAction(action, "Ana").points.map((p) => p.split(" ")[0]);
      expect(new Set(firstWords).size).toBe(firstWords.length);
    }
  });

  it("adds a message only when it says more than the title", () => {
    expect(describeStatusAction("archive", "Ana").message).toBe("");
    for (const action of ["markAway", "markActive", "restore"] as const) {
      expect(describeStatusAction(action, "Ana").message).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("never names the product", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const copy = describeStatusAction(action, "Ana");
      expect([copy.title, copy.message, ...copy.points].join(" ")).not.toMatch(
        /DubGrid|inactive|deactivat/i,
      );
    }
  });
});

describe("describeStatusAction with a return date", () => {
  const RETURN = "2027-01-04";

  it("says what Mark away changes before and after the date", () => {
    const copy = describeStatusAction("markAway", "Ana Torres", { returnDate: RETURN });

    expect(copy.title).toBe("Mark Ana Torres away?");
    expect(copy.message).toBe(
      "They won't be scheduled before Mon, Jan 4, when they're back to Active.",
    );
    expect(copy.points).toEqual([
      "They can still sign in and keep their role.",
      "Shifts before Jan 4 come off the schedule in the draft.",
      "Recurring schedules pause and fill again from Jan 4.",
      "Open requests for days before Jan 4 are closed.",
    ]);
  });

  it("sets a first return date with a message alone", () => {
    expect(describeStatusAction("setReturnDate", "Ana Torres", { returnDate: RETURN })).toEqual({
      label: "Set return date",
      title: "Set a return date for Ana Torres?",
      message: "They're back to Active on Mon, Jan 4, and can be scheduled from then.",
      points: [],
      done: "Return date set",
    });
  });

  it("changes a return date with what the new range clears", () => {
    const copy = describeStatusAction("setReturnDate", "Ana Torres", {
      returnDate: "2027-01-11",
      currentReturnDate: RETURN,
    });

    expect(copy).toMatchObject({
      label: "Change return date",
      title: "Change Ana Torres's return date?",
      message: "They're back to Active on Mon, Jan 11.",
      done: "Return date changed",
    });
    expect(copy.points).toEqual([
      "Shifts before Jan 11 come off the schedule in the draft.",
      "Recurring schedules pause and fill again from Jan 11.",
    ]);
  });

  it("clears a return date with what indefinite Away removes", () => {
    const copy = describeStatusAction("setReturnDate", "Ana", { currentReturnDate: RETURN });

    expect(copy.message).toBe("They stay away until someone marks them active.");
    expect(copy.points).toHaveLength(2);
    expect(copy.done).toBe("Return date cleared");
  });

  it("names the absence that fills the away days", () => {
    const options = { returnDate: RETURN, absenceName: "Vacation" };

    expect(describeStatusAction("markAway", "Ana Torres", options).points).toEqual([
      "They can still sign in and keep their role.",
      "Every day until Jan 4 shows Vacation in the draft, in place of any shift.",
      "Recurring schedules pause and fill again from Jan 4.",
      "Open requests for days before Jan 4 are closed.",
    ]);
    expect(describeStatusAction("setReturnDate", "Ana Torres", options)).toMatchObject({
      message:
        "They're back to Active on Mon, Jan 4, and can be scheduled from then. Every day until Jan 4 shows Vacation in the draft, in place of any shift.",
      points: [],
    });
    expect(
      describeStatusAction("setReturnDate", "Ana Torres", {
        ...options,
        currentReturnDate: RETURN,
      }).points[0],
    ).toBe("Every day until Jan 4 shows Vacation in the draft, in place of any shift.");
  });

  it("follows the dialog rules for every return-date form", () => {
    const forms = [
      describeStatusAction("markAway", "Ana Torres", { returnDate: RETURN, absenceName: "Sick" }),
      describeStatusAction("setReturnDate", "Ana Torres", {
        returnDate: "2027-01-11",
        currentReturnDate: RETURN,
        absenceName: "Sick",
      }),
      describeStatusAction("markAway", "Ana Torres", { returnDate: RETURN }),
      describeStatusAction("setReturnDate", "Ana Torres", { returnDate: RETURN }),
      describeStatusAction("setReturnDate", "Ana Torres", {
        returnDate: "2027-01-11",
        currentReturnDate: RETURN,
      }),
      describeStatusAction("setReturnDate", "Ana Torres", { currentReturnDate: RETURN }),
    ];
    for (const copy of forms) {
      expect(copy.points.length === 0 || copy.points.length >= 2).toBe(true);
      for (const point of copy.points) expect(point).toMatch(/^[A-Z].*\.$/);
      expect([copy.message, ...copy.points].join(" ")).not.toContain("Ana");
      const firstWords = copy.points.map((point) => point.split(" ")[0]);
      expect(new Set(firstWords).size).toBe(firstWords.length);
    }
  });
});
