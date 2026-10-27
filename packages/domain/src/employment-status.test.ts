import { describe, expect, it } from "vitest";
import {
  EMPLOYMENT_STATUS_LABELS,
  canMarkInactive,
  describeCurrentStatus,
  describeEmploymentStatus,
  describePlannedChange,
  describePlannedChangeInFull,
  describeStatusAction,
  statusChoices,
  formatReturnDate,
  isPlannedAwayOn,
  isValidPlannedStart,
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

  it("names a suspended person Suspended, though they are stored active", () => {
    expect(describeEmploymentStatus("active", null, "2026-10-27T05:00:00Z")).toBe("Suspended");
    expect(describeEmploymentStatus("removed", null, "2026-10-27T05:00:00Z")).toBe("Archived");
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

  it("adds no caption that repeats the title or the choice (owner, 2026-10-27)", () => {
    for (const action of [
      "archive",
      "markAway",
      "markActive",
      "restore",
      "reinstate",
      "suspend",
    ] as const) {
      expect(describeStatusAction(action, "Ana").message).toBe("");
    }
    // A return date is news the title doesn't carry.
    expect(describeStatusAction("markAway", "Ana", { returnDate: "2027-01-04" }).message).toMatch(
      /^They won't be scheduled before Mon, Jan 4/,
    );
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

describe("describeStatusAction reinstate", () => {
  it("gives a suspended person's access back, with the name in the title only", () => {
    expect(describeStatusAction("reinstate", "Ana Torres")).toEqual({
      label: "Reinstate",
      title: "Reinstate Ana Torres?",
      message: "",
      points: [],
      done: "Reinstated",
    });
  });
});

describe("statusChoices", () => {
  const onSchedule = { focusAreaIds: [7] };
  const kinds = (state: Parameters<typeof statusChoices>[0]) =>
    statusChoices(state).map((choice) => `${choice.label}:${choice.action}`);

  it("offers an active person Away, Suspended and Archived", () => {
    expect(kinds({ status: "active", ...onSchedule })).toEqual([
      "Away:markAway",
      "Suspended:suspend",
      "Archived:archive",
    ]);
  });

  it("leaves Away out for someone not on the schedule", () => {
    expect(kinds({ status: "active", focusAreaIds: [] })).toEqual([
      "Suspended:suspend",
      "Archived:archive",
    ]);
  });

  it("brings a suspended person back with Reinstate", () => {
    expect(kinds({ status: "active", suspendedAt: "2026-10-26T12:00:00Z", ...onSchedule })).toEqual(
      ["Active:reinstate", "Away:markAway", "Archived:archive"],
    );
  });

  it("brings an Away person back with Mark active, and offers no suspension", () => {
    expect(kinds({ status: "inactive", ...onSchedule })).toEqual([
      "Active:markActive",
      "Archived:archive",
    ]);
  });

  it("only restores an archived person", () => {
    expect(kinds({ status: "removed", archivedAt: "2026-10-01T00:00:00Z", ...onSchedule })).toEqual(
      ["Active:restore"],
    );
  });

  it("never offers the status they're in", () => {
    for (const state of [
      { status: "active" as const, ...onSchedule },
      { status: "inactive" as const, ...onSchedule },
    ]) {
      expect(statusChoices(state).map((choice) => choice.label)).not.toContain(
        describeEmploymentStatus(state.status),
      );
    }
  });
});

describe("describeCurrentStatus", () => {
  it("names the status, its date and its pill tone", () => {
    expect(
      describeCurrentStatus({ status: "inactive", awayUntil: "2026-10-30", focusAreaIds: [] }),
    ).toEqual({
      text: "Away until Fri, Oct 30",
      detail: "Keeps sign-in. Not scheduled while away.",
      tone: "warning",
    });
    expect(
      describeCurrentStatus({
        status: "active",
        suspendedAt: "2026-10-26T12:00:00Z",
        focusAreaIds: [],
      }),
    ).toEqual({
      text: "Suspended since Oct 26",
      detail: "Can't sign in. Stays on the schedule.",
      tone: "danger",
    });
    expect(describeCurrentStatus({ status: "active", focusAreaIds: [] })).toEqual({
      text: "Active",
      detail: "Can sign in and be scheduled.",
      tone: "success",
    });
    expect(describeCurrentStatus({ status: "removed", focusAreaIds: [] }).text).toBe("Archived");
  });
});

describe("describeStatusAction suspend", () => {
  it("names the person in the title only and keeps two full sentences in the box", () => {
    const copy = describeStatusAction("suspend", "Ana Torres");
    expect(copy.title).toBe("Suspend Ana Torres?");
    expect(copy.message).toBe("");
    expect(copy.points).toHaveLength(2);
    for (const point of copy.points) expect(point).toMatch(/^[A-Z].*\.$/);
    expect(copy.points.join(" ")).not.toContain("Ana");
  });
});

describe("planned away (51g1)", () => {
  const planned = {
    status: "active" as const,
    plannedStatus: "away" as const,
    plannedFrom: "2026-11-10",
    plannedUntil: "2027-01-04",
  };

  it("locks the days from the start up to the day they're back", () => {
    expect(isSchedulableOn(planned, "2026-11-09")).toBe(true);
    expect(isSchedulableOn(planned, "2026-11-10")).toBe(false);
    expect(isSchedulableOn(planned, "2027-01-03")).toBe(false);
    expect(isSchedulableOn(planned, "2027-01-04")).toBe(true);
  });

  it("locks every day from the start when there's no return date", () => {
    const open = { ...planned, plannedUntil: null };
    expect(isPlannedAwayOn(open, "2026-11-09")).toBe(false);
    expect(isPlannedAwayOn(open, "2030-01-01")).toBe(true);
    expect(isSchedulableOn(open, "2030-01-01")).toBe(false);
  });

  it("says what's planned beside the Active pill and in the status box", () => {
    expect(describePlannedChange(planned)).toBe("Away from Nov 10");
    expect(describePlannedChange({ plannedStatus: null })).toBeNull();
    expect(describePlannedChangeInFull(planned)).toBe("Away from Nov 10, back Jan 4");
    expect(describeCurrentStatus({ ...planned, focusAreaIds: [1] })).toEqual({
      text: "Active",
      detail: "Away from Tue, Nov 10, back Mon, Jan 4.",
      tone: "success",
    });
    expect(
      describeCurrentStatus({ ...planned, plannedUntil: null, focusAreaIds: [1] }).detail,
    ).toBe("Away from Tue, Nov 10.");
  });

  it("schedules the away for a later start, and keeps Mark away for today", () => {
    const later = describeStatusAction("markAway", "Ana Diaz", {
      startDate: "2026-11-10",
      returnDate: "2027-01-04",
      absenceName: "Vacation",
    });
    expect(later.label).toBe("Schedule away");
    expect(later.message).toBe("They stay Active until Tue, Nov 10.");
    expect(later.points).toEqual([
      "Every day from Nov 10 until Jan 4 shows Vacation in the draft, in place of any shift.",
      "Recurring schedules pause from Nov 10 and fill again from Jan 4.",
      "Open requests for those days are closed.",
    ]);
    expect(describeStatusAction("markAway", "Ana Diaz").label).toBe("Mark away");
  });

  it("removes recurring schedules on the start date when there's no return date", () => {
    const copy = describeStatusAction("markAway", "Ana Diaz", { startDate: "2026-11-10" });
    expect(copy.points).toContain("Recurring schedules set up for them are removed on Nov 10.");
  });

  it("says another change today cancels the planned away", () => {
    for (const action of ["markAway", "suspend", "archive"] as const) {
      const copy = describeStatusAction(action, "Ana Diaz", { plannedFrom: "2026-11-10" });
      expect(copy.points).toContain("The away planned from Nov 10 is cancelled.");
    }
  });

  it("edits and cancels a planned away within the dialog rules", () => {
    const edit = describeStatusAction("setPlannedChange", "Ana Diaz", {
      startDate: "2026-11-12",
      returnDate: "2027-01-04",
    });
    expect(edit.label).toBe("Save changes");
    expect(edit.message).toBe("Away from Thu, Nov 12, back Mon, Jan 4.");
    const cancel = describeStatusAction("cancelPlannedChange", "Ana Diaz", {
      absenceName: "Vacation",
    });
    expect(cancel.label).toBe("Cancel planned away");
    for (const copy of [edit, cancel]) {
      expect(copy.points.length).toBeGreaterThanOrEqual(2);
      for (const point of copy.points) expect(point).toMatch(/^[A-Z].*\.$/);
      expect([copy.message, ...copy.points].join(" ")).not.toContain("Ana");
    }
  });
});

describe("isValidPlannedStart", () => {
  it("takes a day after today up to a year ahead", () => {
    expect(isValidPlannedStart("2026-10-27", "2026-10-27")).toBe(false);
    expect(isValidPlannedStart("2026-10-28", "2026-10-27")).toBe(true);
    expect(isValidPlannedStart("2027-10-27", "2026-10-27")).toBe(true);
    expect(isValidPlannedStart("2027-10-28", "2026-10-27")).toBe(false);
    expect(isValidPlannedStart("soon", "2026-10-27")).toBe(false);
  });
});
