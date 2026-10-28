import { describe, expect, it } from "vitest";
import {
  describeReturn,
  describeUpcomingStatus,
  plannedReturn,
  describeFirstDay,
  describeUpcomingChange,
  formatFirstDay,
  isBeforeFirstDay,
  isValidFirstDay,
  upcomingFirstDay,
  suggestedStatusChoice,
  describeStatusCard,
  statusMark,
  EMPLOYMENT_STATUS_LABELS,
  canMarkInactive,
  describeCurrentStatus,
  describeEmploymentStatus,
  describePlannedChange,
  describePlannedChangeInFull,
  describeStatusAction,
  statusChoices,
  canOffboardAtTier,
  OFFBOARD_OUT_OF_REACH_MESSAGE,
  RESTORE_OUT_OF_REACH_MESSAGE,
  availableStatusChoices,
  NO_ACCOUNT_MESSAGE,
  NOT_ON_SCHEDULE_MESSAGE,
  NOT_SUSPENDABLE_MESSAGE,
  formatReturnDate,
  isPlannedAwayOn,
  isAfterPlannedLastDay,
  isValidLastDay,
  isValidPlannedStart,
  plannedFromForLastDay,
  plannedLastDay,
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
    expect(describeEmploymentStatus("removed")).toBe("Offboarded");
  });

  it("names an Away person's return date, and only theirs", () => {
    expect(describeEmploymentStatus("inactive", "2027-01-04")).toBe("Away until Jan 4");
    expect(describeEmploymentStatus("inactive", null)).toBe("Away");
    expect(describeEmploymentStatus("active", "2027-01-04")).toBe("Active");
  });

  it("names a suspended person Suspended, though they are stored active", () => {
    expect(describeEmploymentStatus("active", null, "2026-10-27T05:00:00Z")).toBe("Suspended");
    expect(describeEmploymentStatus("removed", null, "2026-10-27T05:00:00Z")).toBe("Offboarded");
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
  it("brings Away back with Mark active and Offboarded back with Restore", () => {
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
      label: "Offboard",
      title: "Offboard Ana Torres?",
      done: "Offboarded",
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

  it("tells the manager that Away keeps sign-in and Offboard ends it", () => {
    expect(describeStatusAction("markAway", "Ana").unchanged).toEqual([
      "They can still sign in and keep their role.",
    ]);
    expect(describeStatusAction("archive", "Ana").points[0]).toBe("They can no longer sign in.");
    expect(describeStatusAction("archive", "Ana").unchanged).toEqual([
      "Past records stay, and you can restore them later.",
    ]);
  });

  it("keeps what changes apart from what stays the same", () => {
    const suspend = describeStatusAction("suspend", "Ana");
    expect(suspend.points).toEqual([
      "They're signed out on every device and can't sign in.",
      "Open requests they're part of are closed, and pickups they claimed go back up for others.",
    ]);
    expect(suspend.unchanged).toEqual(["Their shifts stay, and you can keep scheduling them."]);
    expect(describeStatusAction("cancelPlannedChange", "Ana")).toMatchObject({
      points: ["They stay Active and can be scheduled on those days again."],
      unchanged: ["Shifts already taken off those days stay off."],
    });
  });

  it("keeps the box to two or more full sentences, or none", () => {
    for (const action of ["markAway", "archive", "markActive", "restore"] as const) {
      const copy = describeStatusAction(action, "Ana");
      const points = [...copy.points, ...copy.unchanged];
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
    expect(copy.unchanged).toEqual(["They can still sign in and keep their role."]);
    expect(copy.points).toEqual([
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
      unchanged: [],
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
      unchanged: [],
      done: "Reinstated",
    });
  });
});

describe("canOffboardAtTier (51k)", () => {
  const admin = { isSuperAdmin: false, isGridmaster: false };
  it("lets a Super Admin or Gridmaster reach every role", () => {
    for (const role of ["super_admin", "admin", "user", null]) {
      expect(canOffboardAtTier({ isSuperAdmin: true, isGridmaster: false }, role)).toBe(true);
      expect(canOffboardAtTier({ isSuperAdmin: false, isGridmaster: true }, role)).toBe(true);
    }
  });

  it("lets an Admin reach everyone but a Super Admin", () => {
    expect(canOffboardAtTier(admin, "user")).toBe(true);
    expect(canOffboardAtTier(admin, "admin")).toBe(true);
    expect(canOffboardAtTier(admin, null)).toBe(true);
    expect(canOffboardAtTier(admin, undefined)).toBe(true);
    expect(canOffboardAtTier(admin, "super_admin")).toBe(false);
  });
});

describe("statusChoices", () => {
  const onSchedule = { focusAreaIds: [7] };
  const kinds = (state: Parameters<typeof statusChoices>[0]) =>
    statusChoices(state).map(
      (choice) => `${choice.label}:${choice.action}${choice.available ? "" : " (disabled)"}`,
    );
  const reasons = (state: Parameters<typeof statusChoices>[0]) =>
    Object.fromEntries(
      statusChoices(state).map((choice) => [choice.kind, choice.unavailableReason]),
    );

  it("offers an active person Away, Suspended and Offboarded", () => {
    expect(kinds({ status: "active", ...onSchedule })).toEqual([
      "Away:markAway",
      "Suspended:suspend",
      "Offboarded:archive",
    ]);
  });

  it("lists Offboard and Restore disabled when the manager can't reach them (51k)", () => {
    const active = { status: "active" as const, ...onSchedule };
    const offboarded = { status: "removed" as const, ...onSchedule };
    const activeChoices = statusChoices(active, { canOffboard: false });
    expect(activeChoices.find((option) => option.action === "archive")).toMatchObject({
      available: false,
      unavailableReason: OFFBOARD_OUT_OF_REACH_MESSAGE,
    });
    expect(activeChoices.find((option) => option.action === "suspend")?.available).toBe(true);
    expect(
      statusChoices(offboarded, { canOffboard: false }).find(
        (option) => option.action === "restore",
      ),
    ).toMatchObject({ available: false, unavailableReason: RESTORE_OUT_OF_REACH_MESSAGE });
    expect(suggestedStatusChoice(offboarded, { canOffboard: false })).toBeNull();
    expect(suggestedStatusChoice(offboarded)?.action).toBe("restore");
  });

  it("lists Away, disabled with a reason, for someone not on the schedule", () => {
    const state = { status: "active" as const, focusAreaIds: [] };
    expect(kinds(state)).toEqual([
      "Away:markAway (disabled)",
      "Suspended:suspend",
      "Offboarded:archive",
    ]);
    expect(reasons(state).away).toBe(NOT_ON_SCHEDULE_MESSAGE);
  });

  it("brings a suspended person back with Reinstate", () => {
    expect(kinds({ status: "active", suspendedAt: "2026-10-26T12:00:00Z", ...onSchedule })).toEqual(
      ["Active:reinstate", "Away:markAway", "Offboarded:archive"],
    );
  });

  it("brings an Away person back with Mark active, and says why they can't be suspended", () => {
    const state = { status: "inactive" as const, ...onSchedule };
    expect(kinds(state)).toEqual([
      "Active:markActive",
      "Suspended:suspend (disabled)",
      "Offboarded:archive",
    ]);
    expect(reasons(state).suspended).toBe(NOT_SUSPENDABLE_MESSAGE);
  });

  it("lists Away disabled, pointing at Edit plan, for someone with an away planned", () => {
    const state = {
      status: "active" as const,
      plannedStatus: "away" as const,
      plannedFrom: "2026-11-01",
      ...onSchedule,
    };
    expect(kinds(state)).toEqual([
      "Away:markAway (disabled)",
      "Suspended:suspend",
      "Offboarded:archive",
    ]);
    expect(reasons(state).away).toBe("Planned from Sun, Nov 1. Change it with Edit plan.");
  });

  it("restores an archived person, and says why the rest wait", () => {
    const state = { status: "removed" as const, archivedAt: "2026-10-01T00:00:00Z", ...onSchedule };
    expect(kinds(state)).toEqual([
      "Active:restore",
      "Away:markAway (disabled)",
      "Suspended:suspend (disabled)",
    ]);
    expect(reasons(state)).toEqual({
      active: null,
      away: "Only someone on staff can be marked away.",
      suspended: NOT_SUSPENDABLE_MESSAGE,
    });
  });

  it("lists all three for someone with no account and an away planned, Offboard alone available", () => {
    const state = {
      status: "active" as const,
      userId: null,
      plannedStatus: "away" as const,
      plannedFrom: "2026-11-01",
      ...onSchedule,
    };
    expect(kinds(state)).toEqual([
      "Away:markAway (disabled)",
      "Suspended:suspend (disabled)",
      "Offboarded:archive",
    ]);
    expect(reasons(state).suspended).toBe(NO_ACCOUNT_MESSAGE);
    expect(availableStatusChoices(state).map((choice) => choice.action)).toEqual(["archive"]);
  });

  it("gives every unavailable choice a reason, and an available one none", () => {
    for (const state of [
      { status: "active" as const, focusAreaIds: [], userId: null },
      { status: "inactive" as const, ...onSchedule },
      { status: "removed" as const, archivedAt: "2026-10-01T00:00:00Z", ...onSchedule },
      {
        status: "active" as const,
        plannedStatus: "removed" as const,
        plannedFrom: "2026-10-30",
        ...onSchedule,
      },
    ]) {
      for (const choice of statusChoices(state)) {
        expect(Boolean(choice.unavailableReason)).toBe(!choice.available);
      }
    }
  });

  it("says what each choice does, in one sentence, for when it's the only one", () => {
    const [restore] = statusChoices({
      status: "removed",
      archivedAt: "2026-10-01T00:00:00Z",
      ...onSchedule,
    });
    expect(restore.outcome).toBe(
      "They'll be Active again: back on staff, and they can sign in and be scheduled.",
    );
    for (const state of [
      { status: "active" as const, ...onSchedule },
      { status: "inactive" as const, ...onSchedule },
      { status: "active" as const, suspendedAt: "2026-10-26T12:00:00Z", ...onSchedule },
    ]) {
      for (const choice of statusChoices(state)) {
        expect(choice.outcome).toMatch(new RegExp(`^They'll be ${choice.label}\\b.*\\.$`));
      }
    }
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
    expect(describeCurrentStatus({ status: "removed", focusAreaIds: [] }).text).toBe("Offboarded");
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

describe("last day (51g2)", () => {
  // Last day Sun, Nov 8: stored as offboarded from Mon, Nov 9.
  const leaving = {
    status: "active" as const,
    plannedStatus: "removed" as const,
    plannedFrom: "2026-11-09",
    plannedUntil: null,
  };

  it("stores the day after the last day, and reads the last day back", () => {
    expect(plannedFromForLastDay("2026-11-08")).toBe("2026-11-09");
    expect(plannedFromForLastDay("2026-12-31")).toBe("2027-01-01");
    expect(plannedLastDay(leaving)).toBe("2026-11-08");
    expect(plannedLastDay({ plannedStatus: "away", plannedFrom: "2026-11-09" })).toBeNull();
  });

  it("schedules them through the last day and never after it", () => {
    expect(isSchedulableOn(leaving, "2026-11-08")).toBe(true);
    expect(isAfterPlannedLastDay(leaving, "2026-11-08")).toBe(false);
    expect(isSchedulableOn(leaving, "2026-11-09")).toBe(false);
    expect(isSchedulableOn(leaving, "2030-01-01")).toBe(false);
    expect(isPlannedAwayOn(leaving, "2026-11-09")).toBe(false);
  });

  it("takes a last day from today up to a year ahead", () => {
    expect(isValidLastDay("2026-10-27", "2026-10-27")).toBe(true);
    expect(isValidLastDay("2026-10-26", "2026-10-27")).toBe(false);
    expect(isValidLastDay("2027-10-27", "2026-10-27")).toBe(true);
    expect(isValidLastDay("2027-10-28", "2026-10-27")).toBe(false);
    expect(isValidLastDay("2027-02-29", "2026-10-27")).toBe(false);
    expect(isValidLastDay("soon", "2026-10-27")).toBe(false);
  });

  it("says Leaving with the last day on the pill, the record, the box and the card", () => {
    expect(describePlannedChange(leaving)).toBe("Leaving Nov 8");
    expect(describePlannedChangeInFull(leaving)).toBe("Leaving Nov 8");
    expect(describeCurrentStatus({ ...leaving, focusAreaIds: [] }).detail).toBe(
      "Leaving Sun, Nov 8.",
    );
    expect(describeStatusCard(leaving).planned).toEqual({
      title: "Leaving Sun, Nov 8",
      detail: "Offboarded on Mon, Nov 9.",
    });
    expect(statusMark(leaving)).toEqual({
      kind: "planned",
      label: "Leaving Nov 8",
      tone: "warning",
    });
  });

  it("sets a last day through Offboard, within the dialog rules", () => {
    const copy = describeStatusAction("archive", "Ana Diaz", { lastDay: "2026-11-08" });
    expect(copy.label).toBe("Set last day");
    expect(copy.title).toBe("Offboard Ana Diaz?");
    expect(copy.message).toBe("They stay Active through Sun, Nov 8, their last day.");
    expect(copy.points).toEqual([
      "Shifts after Nov 8 come off the schedule in the draft.",
      "Open requests for days after Nov 8 are closed.",
      "On Nov 9 they're offboarded: they can no longer sign in, and recurring schedules set up for them are removed.",
    ]);
    expect(copy.done).toBe("Last day set");
    const noAccount = describeStatusAction("archive", "Ana Diaz", {
      lastDay: "2026-11-08",
      hasAccount: false,
    });
    expect(noAccount.points.join(" ")).not.toMatch(/sign in/);
    expect(describeStatusAction("archive", "Ana Diaz").label).toBe("Offboard");
  });

  it("replaces a planned away, and is replaced by any other change, saying so", () => {
    const replacingAway = describeStatusAction("archive", "Ana", {
      lastDay: "2026-11-08",
      plannedFrom: "2026-11-02",
      plannedStatus: "away",
    });
    expect(replacingAway.points).toContain("The away planned from Nov 2 is cancelled.");
    for (const options of [{}, { startDate: "2026-11-02" }]) {
      const copy = describeStatusAction("markAway", "Ana", {
        ...options,
        plannedFrom: "2026-11-09",
        plannedStatus: "removed",
      });
      expect(copy.points).toContain("The last day planned for Nov 8 is cancelled.");
    }
    expect(
      describeStatusAction("suspend", "Ana", {
        plannedFrom: "2026-11-09",
        plannedStatus: "removed",
      }).points,
    ).toContain("The last day planned for Nov 8 is cancelled.");
  });

  it("changes and cancels a last day", () => {
    const edit = describeStatusAction("setPlannedChange", "Ana", {
      plannedStatus: "removed",
      lastDay: "2026-11-12",
    });
    expect(edit).toMatchObject({
      label: "Save changes",
      title: "Change Ana's last day?",
      message: "They stay Active through Thu, Nov 12, their last day.",
      done: "Last day changed",
    });
    expect(edit.unchanged).toEqual(["Shifts already taken off after their old last day stay off."]);
    expect(
      describeStatusAction("cancelPlannedChange", "Ana", { plannedStatus: "removed" }),
    ).toMatchObject({
      label: "Cancel last day",
      title: "Cancel Ana's last day?",
      message: "They stay Active and can be scheduled after that day again.",
      points: [],
      done: "Last day cancelled",
    });
  });

  it("lists Offboard disabled, pointing at Edit plan, while a last day is planned", () => {
    const choices = statusChoices({ ...leaving, focusAreaIds: [1] });
    expect(choices.map((c) => c.kind)).toEqual(["away", "suspended", "archived"]);
    const offboard = choices.find((c) => c.kind === "archived");
    expect(offboard?.available).toBe(false);
    expect(offboard?.unavailableReason).toBe("Leaving Sun, Nov 8. Change it with Edit plan.");
  });
});

describe("suspended until (51g3)", () => {
  // Suspended from Tue, Nov 10, until Fri, Nov 20.
  const planned = {
    status: "active" as const,
    plannedStatus: "suspended" as const,
    plannedFrom: "2026-11-10",
    plannedUntil: "2026-11-20",
  };
  const suspended = {
    status: "active" as const,
    suspendedAt: "2026-10-26T12:00:00Z",
    suspendedUntil: "2026-11-20",
  };

  it("names the end on the pill, the box and the card", () => {
    expect(describeEmploymentStatus("active", null, suspended.suspendedAt, "2026-11-20")).toBe(
      "Suspended until Nov 20",
    );
    expect(describeEmploymentStatus("active", null, suspended.suspendedAt)).toBe("Suspended");
    expect(describeCurrentStatus(suspended).text).toBe("Suspended until Fri, Nov 20");
    expect(describeStatusCard(suspended).current).toMatchObject({
      kind: "suspended",
      title: "Suspended until Fri, Nov 20",
    });
  });

  it("keeps a planned suspension schedulable on every day", () => {
    for (const day of ["2026-11-09", "2026-11-10", "2026-11-19", "2026-11-20"]) {
      expect(isSchedulableOn(planned, day)).toBe(true);
    }
  });

  it("says what's planned beside the Active pill, in the box and on the card", () => {
    expect(describePlannedChange(planned)).toBe("Suspended from Nov 10");
    expect(describePlannedChangeInFull(planned)).toBe("Suspended from Nov 10, until Nov 20");
    expect(describePlannedChangeInFull({ ...planned, plannedUntil: null })).toBe(
      "Suspended from Nov 10",
    );
    expect(describeCurrentStatus({ ...planned, focusAreaIds: [] }).detail).toBe(
      "Suspended from Tue, Nov 10, until Fri, Nov 20.",
    );
    expect(describeStatusCard(planned).planned).toEqual({
      title: "Suspended from Tue, Nov 10",
      detail: "Until Fri, Nov 20.",
    });
    expect(describeStatusCard({ ...planned, plannedUntil: null }).planned?.detail).toBe(
      "No end date.",
    );
    expect(statusMark(planned)).toMatchObject({ kind: "planned" });
  });

  it("suspends now with an end, within the dialog rules", () => {
    const copy = describeStatusAction("suspend", "Ana Diaz", { returnDate: "2026-11-20" });
    expect(copy).toMatchObject({
      label: "Suspend",
      title: "Suspend Ana Diaz?",
      message: "They get access back on Fri, Nov 20.",
      done: "Suspended",
    });
    expect(copy.points).toEqual([
      "They're signed out on every device and can't sign in.",
      "Open requests they're part of are closed, and pickups they claimed go back up for others.",
    ]);
    expect(copy.message).not.toMatch(/Ana/);
  });

  it("schedules a suspension for a later start", () => {
    const copy = describeStatusAction("suspend", "Ana", {
      startDate: "2026-11-10",
      returnDate: "2026-11-20",
      plannedFrom: "2026-11-02",
      plannedStatus: "away",
    });
    expect(copy).toMatchObject({
      label: "Schedule suspension",
      message: "They keep their access until Tue, Nov 10.",
      done: "Suspension scheduled",
    });
    expect(copy.points).toEqual([
      "On Nov 10 they're signed out on every device and can't sign in.",
      "Open requests they're part of are closed then, and pickups they claimed go back up for others.",
      "They get access back on Nov 20.",
      "The away planned from Nov 2 is cancelled.",
    ]);
    expect(copy.unchanged).toEqual(["Their shifts stay, and you can keep scheduling them."]);
  });

  it("sets, changes and clears a suspension's end", () => {
    expect(
      describeStatusAction("setSuspendedUntil", "Ana", { returnDate: "2026-11-20" }),
    ).toMatchObject({
      label: "Set end date",
      title: "Set an end date for Ana's suspension?",
      message: "They get access back on Fri, Nov 20.",
      done: "End date set",
    });
    expect(
      describeStatusAction("setSuspendedUntil", "Ana", {
        returnDate: null,
        currentReturnDate: "2026-11-20",
      }),
    ).toMatchObject({
      label: "Change end date",
      title: "Change when Ana's suspension ends?",
      message: "They stay suspended until someone reinstates them.",
      done: "End date cleared",
    });
  });

  it("changes and cancels a planned suspension, and another change says it's cancelled", () => {
    expect(
      describeStatusAction("setPlannedChange", "Ana", {
        plannedStatus: "suspended",
        startDate: "2026-11-12",
        returnDate: null,
      }),
    ).toMatchObject({
      label: "Save changes",
      title: "Change Ana's planned suspension?",
      message: "Suspended from Thu, Nov 12.",
      done: "Planned suspension changed",
    });
    expect(
      describeStatusAction("cancelPlannedChange", "Ana", { plannedStatus: "suspended" }),
    ).toMatchObject({
      label: "Cancel planned suspension",
      title: "Cancel Ana's planned suspension?",
      message: "They keep their access.",
      done: "Planned suspension cancelled",
    });
    expect(
      describeStatusAction("markAway", "Ana", {
        plannedFrom: "2026-11-10",
        plannedStatus: "suspended",
      }).points,
    ).toContain("The suspension planned from Nov 10 is cancelled.");
  });

  it("lists Suspended disabled while one is planned, pointing at Edit plan", () => {
    const suspend = statusChoices({ ...planned, focusAreaIds: [1] }).find(
      (c) => c.kind === "suspended",
    );
    expect(suspend).toMatchObject({
      available: false,
      unavailableReason: "Planned from Tue, Nov 10. Change it with Edit plan.",
    });
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

describe("statusMark", () => {
  it("marks Suspended, Away, a planned away and Offboarded, and leaves Active bare", () => {
    expect(statusMark({ status: "active" })).toBeNull();
    expect(statusMark({ status: "active", suspendedAt: "2026-10-26T12:00:00Z" })).toEqual({
      kind: "suspended",
      label: "Suspended: won't see this in the app",
      tone: "danger",
    });
    expect(statusMark({ status: "inactive", awayUntil: "2027-01-04" })).toEqual({
      kind: "away",
      label: "Away until Mon, Jan 4",
      tone: "warning",
    });
    expect(statusMark({ status: "inactive" })?.label).toBe("Away");
    expect(
      statusMark({
        status: "active",
        plannedStatus: "away",
        plannedFrom: "2026-11-10",
        plannedUntil: "2027-01-04",
      }),
    ).toEqual({ kind: "planned", label: "Away from Nov 10, back Jan 4", tone: "warning" });
    expect(statusMark({ status: "removed" })).toEqual({
      kind: "archived",
      label: "Offboarded",
      tone: "neutral",
    });
  });
});

describe("describeStatusCard", () => {
  it("says where they stand, and a planned away on a card of its own", () => {
    expect(
      describeStatusCard(
        {
          status: "active",
          plannedStatus: "away",
          plannedFrom: "2026-11-10",
          plannedUntil: "2027-01-04",
        },
        { absenceName: "Vacation" },
      ),
    ).toEqual({
      current: {
        kind: "active",
        title: "Active",
        detail: "Can sign in and be scheduled.",
        tone: "success",
      },
      planned: {
        title: "Away from Tue, Nov 10",
        detail: "Back Mon, Jan 4. Vacation on those days.",
      },
      starts: null,
    });
  });

  it("names the absence an Away person's days hold, and nothing planned", () => {
    const card = describeStatusCard(
      { status: "inactive", awayUntil: "2027-01-04" },
      { absenceName: "Vacation" },
    );
    expect(card.current).toMatchObject({
      kind: "away",
      title: "Away until Mon, Jan 4",
      detail: "Keeps sign-in. Not scheduled while away. Vacation on those days.",
    });
    expect(card.planned).toBeNull();
    expect(
      describeStatusCard({ status: "active", suspendedAt: "2026-10-26T12:00:00Z" }).current,
    ).toMatchObject({ kind: "suspended", detail: "Can't sign in. Stays on the schedule." });
  });
});

describe("suggestedStatusChoice", () => {
  const onSchedule = { focusAreaIds: [7] };

  it("offers bringing them back first, and nothing for someone Active", () => {
    expect(
      suggestedStatusChoice({
        status: "active",
        suspendedAt: "2026-10-26T12:00:00Z",
        ...onSchedule,
      })?.action,
    ).toBe("reinstate");
    expect(suggestedStatusChoice({ status: "inactive", ...onSchedule })?.action).toBe("markActive");
    expect(
      suggestedStatusChoice({
        status: "removed",
        archivedAt: "2026-10-01T00:00:00Z",
        ...onSchedule,
      })?.action,
    ).toBe("restore");
    expect(suggestedStatusChoice({ status: "active", ...onSchedule })).toBeNull();
    expect(
      suggestedStatusChoice({
        status: "active",
        plannedStatus: "away",
        plannedFrom: "2026-11-10",
        ...onSchedule,
      }),
    ).toBeNull();
  });
});

describe("someone with no account", () => {
  const onSchedule = { focusAreaIds: [7], userId: null };

  it("can't be suspended, and nothing promises them sign-in", () => {
    const choices = availableStatusChoices({ status: "active", ...onSchedule });
    expect(choices.map((choice) => choice.action)).toEqual(["markAway", "archive"]);
    for (const choice of choices) expect(choice.detail + choice.outcome).not.toMatch(/sign/i);
    expect(describeCurrentStatus({ status: "active", ...onSchedule }).detail).toBe(
      "Can be scheduled.",
    );
    expect(describeCurrentStatus({ status: "inactive", ...onSchedule }).detail).toBe(
      "Not scheduled while away.",
    );
    expect(
      statusChoices({ status: "removed", archivedAt: "2026-10-01T00:00:00Z", ...onSchedule })[0]
        .outcome,
    ).toBe("They'll be Active again: back on staff, and they can be scheduled.");
  });

  it("confirms Away and Offboard without mentioning sign-in", () => {
    for (const action of ["markAway", "archive"] as const) {
      const copy = describeStatusAction(action, "Ana", { hasAccount: false });
      expect([...copy.points, ...copy.unchanged].join(" ")).not.toMatch(/sign in/i);
    }
  });

  it("still offers an account holder Suspend", () => {
    expect(
      statusChoices({ status: "active", focusAreaIds: [7], userId: "user-1" }).map(
        (choice) => choice.action,
      ),
    ).toContain("suspend");
  });
});

describe("first day (51g4)", () => {
  const today = "2026-10-28";
  const newHire = { status: "active" as const, firstDay: "2026-11-10" };

  it("refuses every day before it and nothing from it on", () => {
    expect(isBeforeFirstDay(newHire, "2026-11-09")).toBe(true);
    expect(isBeforeFirstDay(newHire, "2026-11-10")).toBe(false);
    expect(isSchedulableOn(newHire, "2026-11-09")).toBe(false);
    expect(isSchedulableOn(newHire, "2026-11-10")).toBe(true);
    expect(isSchedulableOn({ status: "active", firstDay: null }, "2026-11-09")).toBe(true);
    expect(
      isSchedulableOn(
        { status: "inactive", awayUntil: "2026-11-01", firstDay: "2026-11-10" },
        "2026-11-05",
      ),
    ).toBe(false);
  });

  it("keeps a planned away's own days locked after it", () => {
    const person = {
      ...newHire,
      plannedStatus: "away" as const,
      plannedFrom: "2026-12-01",
      plannedUntil: "2026-12-08",
    };
    expect(isSchedulableOn(person, "2026-11-20")).toBe(true);
    expect(isSchedulableOn(person, "2026-12-02")).toBe(false);
  });

  it("is upcoming only while it is after today", () => {
    expect(upcomingFirstDay(newHire, today)).toBe("2026-11-10");
    expect(upcomingFirstDay(newHire, "2026-11-10")).toBeNull();
    expect(upcomingFirstDay({ firstDay: null }, today)).toBeNull();
  });

  it("accepts any past day and up to a year ahead", () => {
    expect(isValidFirstDay("2019-03-04", today)).toBe(true);
    expect(isValidFirstDay("2027-10-28", today)).toBe(true);
    expect(isValidFirstDay("2027-10-29", today)).toBe(false);
    expect(isValidFirstDay("2026-02-30", today)).toBe(false);
    expect(isValidFirstDay("Nov 10", today)).toBe(false);
  });

  it("reads Starts Nov 10, and a full date on a record", () => {
    expect(describeFirstDay("2026-11-10")).toBe("Starts Nov 10");
    expect(describeFirstDay("2026-11-10", { weekday: true })).toBe("Starts Tue, Nov 10");
    expect(formatFirstDay("2026-11-10")).toBe("Nov 10, 2026");
  });

  it("comes before a planned change in the People list's muted text", () => {
    expect(describeUpcomingChange(newHire, today)).toBe("Starts Nov 10");
    expect(
      describeUpcomingChange(
        { ...newHire, plannedStatus: "removed", plannedFrom: "2027-01-01" },
        today,
      ),
    ).toBe("Starts Nov 10");
    expect(
      describeUpcomingChange(
        { firstDay: "2026-10-01", plannedStatus: "removed", plannedFrom: "2027-01-01" },
        today,
      ),
    ).toBe("Leaving Dec 31");
    expect(describeUpcomingChange({ firstDay: "2026-10-01" }, today)).toBeNull();
  });

  it("puts a dashed First day card beside the status card while it is ahead", () => {
    expect(describeStatusCard(newHire, { today }).starts).toEqual({
      title: "Starts Tue, Nov 10",
      detail: "Can't be scheduled before then.",
    });
    expect(describeStatusCard(newHire, { today: "2026-11-10" }).starts).toBeNull();
    expect(describeStatusCard(newHire).starts).toBeNull();
    expect(describeStatusCard({ ...newHire, status: "removed" }, { today }).starts).toBeNull();
  });

  it("marks their name until then, unless a change is planned", () => {
    expect(statusMark(newHire, today)).toEqual({
      kind: "planned",
      label: "Starts Nov 10",
      tone: "warning",
    });
    expect(statusMark(newHire)).toBeNull();
    expect(statusMark(newHire, "2026-11-10")).toBeNull();
    expect(
      statusMark({ ...newHire, plannedStatus: "removed", plannedFrom: "2027-01-01" }, today)?.label,
    ).toBe("Leaving Dec 31");
  });
});

describe("a planned return (51l)", () => {
  const onSchedule = { focusAreaIds: [1] };
  const returning = {
    status: "removed" as const,
    archivedAt: "2026-10-01T00:00:00Z",
    plannedStatus: "active" as const,
    plannedFrom: "2026-11-10",
    ...onSchedule,
  };

  it("reads the return day", () => {
    expect(plannedReturn(returning)).toBe("2026-11-10");
    expect(plannedReturn({ plannedStatus: "removed", plannedFrom: "2026-11-10" })).toBeNull();
    expect(describeReturn("2026-11-10")).toBe("Returns Nov 10");
    expect(describeReturn("2026-11-10", { weekday: true })).toBe("Returns Tue, Nov 10");
  });

  it("names it in lists, on records and beside the name", () => {
    expect(describePlannedChange(returning)).toBe("Returns Nov 10");
    expect(describePlannedChangeInFull(returning)).toBe("Returns Nov 10");
    expect(describeUpcomingStatus(returning, "2026-10-28")).toBe("Returns Nov 10");
    expect(
      describeUpcomingStatus({ status: "removed", archivedAt: "2026-10-01" }, "2026-10-28"),
    ).toBeNull();
    expect(
      describeUpcomingStatus(
        { status: "active", plannedStatus: "removed", plannedFrom: "2026-11-09" },
        "2026-10-28",
      ),
    ).toBe("Leaving Nov 8");
    expect(statusMark(returning)).toEqual({
      kind: "archived",
      label: "Offboarded, returns Nov 10",
      tone: "neutral",
    });
  });

  it("shows a dashed planned card on the Offboarded status card", () => {
    const card = describeStatusCard(returning, { today: "2026-10-28" });
    expect(card.current.kind).toBe("archived");
    expect(card.planned).toEqual({
      title: "Returns Tue, Nov 10",
      detail: "Back to Active then: they can sign in and be scheduled.",
    });
    expect(describeStatusCard({ ...returning, userId: null }).planned?.detail).toBe(
      "Back to Active then, and can be scheduled.",
    );
  });

  it("disables Restore while a return is planned, so the card offers Edit plan alone", () => {
    const restore = statusChoices(returning).find((option) => option.action === "restore");
    expect(restore).toMatchObject({
      available: false,
      unavailableReason: "Returns Tue, Nov 10. Change it with Edit plan.",
    });
    expect(availableStatusChoices(returning)).toEqual([]);
    expect(suggestedStatusChoice(returning)).toBeNull();
    expect(
      statusChoices(returning, { canOffboard: false }).find((option) => option.action === "restore")
        ?.unavailableReason,
    ).toBe(RESTORE_OUT_OF_REACH_MESSAGE);
  });

  it("describes Restore on a later date", () => {
    expect(describeStatusAction("restore", "Ana Torres", { startDate: "2026-11-10" })).toEqual({
      label: "Schedule restore",
      title: "Restore Ana Torres?",
      message: "They stay Offboarded until Tue, Nov 10.",
      points: [
        "On Nov 10 they're back to Active and can sign in again.",
        "They can be scheduled from Nov 10, not before.",
      ],
      unchanged: [],
      done: "Restore scheduled",
    });
    expect(
      describeStatusAction("restore", "Ana Torres", {
        startDate: "2026-11-10",
        hasAccount: false,
      }).points[0],
    ).toBe("On Nov 10 they're back to Active.");
    expect(describeStatusAction("restore", "Ana Torres").label).toBe("Restore");
  });

  it("describes moving and cancelling a planned return", () => {
    expect(
      describeStatusAction("setPlannedChange", "Ana Torres", {
        plannedStatus: "active",
        startDate: "2026-11-12",
      }),
    ).toMatchObject({
      label: "Save changes",
      title: "Change Ana Torres's planned return?",
      message: "They stay Offboarded until Thu, Nov 12.",
      done: "Planned return changed",
    });
    expect(
      describeStatusAction("cancelPlannedChange", "Ana Torres", { plannedStatus: "active" }),
    ).toMatchObject({
      label: "Cancel planned return",
      title: "Cancel Ana Torres's planned return?",
      message: "They stay Offboarded until someone restores them.",
      done: "Planned return cancelled",
    });
  });

  it("keeps them unschedulable until the job restores them", () => {
    expect(isSchedulableOn(returning, "2026-11-10")).toBe(false);
    expect(isSchedulableOn(returning, "2026-12-01")).toBe(false);
  });
});
