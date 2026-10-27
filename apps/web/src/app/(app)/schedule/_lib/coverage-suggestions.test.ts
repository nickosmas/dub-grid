import { describe, expect, it } from "vitest";
import type {
  AssignmentDefinition,
  RecurringShift,
  ScheduleCellInput,
  ScheduleCellStateEntry,
  ShiftCategory,
  ShiftRequest,
} from "@/types";
import {
  availabilityFromShifts,
  availabilityWithPlanned,
  daysInARowWith,
  daysPastUsualLimit,
  draftDayFromShifts,
  hasOpenRequest,
  pendingPickupsFromRequests,
  planSuggestionWrites,
  planUndo,
  fairnessStandingWithPlanned,
  isNightAssignment,
  limitRecurringRuns,
  planDaysOff,
  publishedDayFromShifts,
  weekDaysWithPlanned,
  weekHoursWithPlanned,
  workLimitWith,
} from "./coverage-suggestions";
import { scheduleCellSnapshotToInput } from "@/lib/schedule-cells";
import type { CoverageDayOverride, CoverageSuggestion } from "@dubgrid/schedule-core";

const shiftCategories: ShiftCategory[] = [
  { id: 1, orgId: "org", name: "Day", startTime: "07:00", endTime: "15:00", sortOrder: 0 },
  { id: 2, orgId: "org", name: "Evening", startTime: "15:00", endTime: "23:00", sortOrder: 1 },
  { id: 3, orgId: "org", name: "Night", startTime: "23:00", endTime: "07:30", sortOrder: 2 },
];
const assignment = (id: number, shiftId: number): AssignmentDefinition => ({
  id,
  orgId: "org",
  label: `A${id}`,
  name: `Assignment ${id}`,
  color: "#fff",
  border: "#ddd",
  text: "#111",
  shiftId,
  categoryId: shiftId,
  jobId: 10,
  focusAreaId: 7,
  sortOrder: id,
});
const DAY = 100;
const EVENING = 101;
const NIGHT = 102;
const assignments = [assignment(DAY, 1), assignment(EVENING, 2), assignment(NIGHT, 3)];
const LOADED = ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];

function worked(
  assignmentIds: number[],
  options: { mentored?: boolean[]; restOfDay?: number | null } = {},
): ScheduleCellStateEntry {
  const segments = assignmentIds.map((id, position) => ({
    shiftId: assignments.find((item) => item.id === id)?.shiftId ?? null,
    jobId: 10,
    label: `A${id}`,
    position,
    assignmentId: id,
    isMentored: options.mentored?.[position] ?? false,
  }));
  return {
    label: "",
    assignmentIds,
    segments,
    isDraft: false,
    draftKind: null,
    publishedAssignmentDefinitionIds: assignmentIds,
    publishedSegments: segments,
    publishedLabel: "",
    restOfDayAbsenceTypeId: options.restOfDay ?? null,
    effective: {
      kind: "worked",
      segments,
      assignmentIds,
      label: "",
      absenceTypeId: null,
      restOfDayAbsenceTypeId: options.restOfDay ?? null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
  };
}

function absent(absenceTypeId: number): ScheduleCellStateEntry {
  return {
    label: "X",
    assignmentIds: [],
    isDraft: false,
    draftKind: null,
    publishedAssignmentDefinitionIds: [],
    publishedLabel: "X",
    absenceTypeId,
    publishedAbsenceTypeId: absenceTypeId,
    effective: {
      kind: "absence",
      segments: [],
      assignmentIds: [],
      label: "X",
      absenceTypeId,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
  };
}

function availability(
  shifts: Record<string, ScheduleCellStateEntry>,
  dateKey = "2026-10-26",
  id = DAY,
) {
  return availabilityFromShifts(
    { shifts, assignments, shiftCategories, loadedDateKeys: LOADED },
    "ana",
    dateKey,
    id,
  );
}

describe("availabilityFromShifts", () => {
  it("is free with nothing that day or either side", () => {
    expect(availability({})).toEqual({ kind: "free" });
  });

  it("is away before an Away person's return date and free from it (51e)", () => {
    const input = {
      shifts: {},
      assignments,
      shiftCategories,
      loadedDateKeys: LOADED,
      awayUntil: new Map([["ana", "2026-10-27"]]),
    };
    expect(availabilityFromShifts(input, "ana", "2026-10-26", DAY)).toEqual({
      kind: "away",
      until: "2026-10-27",
    });
    expect(availabilityFromShifts(input, "ana", "2026-10-27", DAY)).toEqual({ kind: "free" });
    expect(availabilityWithPlanned(input, [])("ana", "2026-10-26", DAY).kind).toBe("away");
  });

  it("is free beside work that does not overlap", () => {
    expect(availability({ "ana_2026-10-26": worked([EVENING]) })).toEqual({ kind: "free" });
  });

  it("names an all-day absence", () => {
    expect(availability({ "ana_2026-10-26": absent(7) })).toEqual({
      kind: "absence",
      absenceTypeId: 7,
    });
  });

  it("names a rest-of-day absence", () => {
    expect(availability({ "ana_2026-10-26": worked([NIGHT], { restOfDay: 8 }) })).toEqual({
      kind: "restOfDayAbsence",
      absenceTypeId: 8,
    });
  });

  it("names work that overlaps that day", () => {
    const shifts = { "ana_2026-10-26": worked([assignment(103, 1).id]) };
    expect(
      availabilityFromShifts(
        {
          shifts,
          assignments: [...assignments, assignment(103, 1)],
          shiftCategories,
          loadedDateKeys: LOADED,
        },
        "ana",
        "2026-10-26",
        DAY,
      ),
    ).toEqual({ kind: "overlap", dateKey: "2026-10-26", assignmentId: 103 });
  });

  it("names a night before that runs into the shift", () => {
    expect(availability({ "ana_2026-10-25": worked([NIGHT]) })).toEqual({
      kind: "overlap",
      dateKey: "2026-10-25",
      assignmentId: NIGHT,
    });
  });

  it("says a neighbouring day outside the loaded dates could not be checked", () => {
    expect(availability({}, "2026-10-28")).toEqual({ kind: "unverified", dateKey: "2026-10-29" });
  });
});

describe("days read from the shift map", () => {
  it("reads a deleted draft as an empty day and keeps the published side", () => {
    const entry = { ...worked([DAY]), isDelete: true };
    expect(
      draftDayFromShifts({ "ana_2026-10-26": entry }, "ana", "2026-10-26").assignmentIds,
    ).toEqual([]);
    expect(
      publishedDayFromShifts({ "ana_2026-10-26": entry }, "ana", "2026-10-26").assignmentIds,
    ).toEqual([DAY]);
  });

  it("carries mentoring and absences", () => {
    const shifts = {
      "ana_2026-10-26": worked([DAY, EVENING], { mentored: [false, true], restOfDay: 8 }),
      "ana_2026-10-27": absent(7),
    };
    expect(draftDayFromShifts(shifts, "ana", "2026-10-26")).toEqual({
      assignmentIds: [DAY, EVENING],
      mentoredAssignmentIds: [EVENING],
      absenceTypeId: null,
      restOfDayAbsenceTypeId: 8,
    });
    expect(publishedDayFromShifts(shifts, "ana", "2026-10-27").absenceTypeId).toBe(7);
  });
});

describe("requests", () => {
  const request = (overrides: Partial<ShiftRequest>): ShiftRequest =>
    ({
      id: "r1",
      type: "pickup",
      status: "pending_approval",
      requesterEmpId: "ana",
      requesterShiftDate: "2026-10-26",
      requesterFocusAreaId: 7,
      requesterAssignmentDefinitionIds: [DAY],
      targetEmpId: null,
      targetShiftDate: null,
      parentRequestId: null,
      ...overrides,
    }) as ShiftRequest;

  it("counts an open-shift pickup waiting for approval", () => {
    expect(pendingPickupsFromRequests([request({})])).toEqual([
      {
        requestId: "r1",
        employeeId: "ana",
        dateKey: "2026-10-26",
        focusAreaId: 7,
        assignmentIds: [DAY],
      },
    ]);
  });

  it("leaves out a claimed pickup, a swap, an answered request and a child request", () => {
    expect(
      pendingPickupsFromRequests([
        request({ targetEmpId: "ben" }),
        request({ type: "swap" }),
        request({ status: "approved" }),
        request({ parentRequestId: "r0" }),
      ]),
    ).toEqual([]);
  });

  it("counts a waiting call-off as a request on that day, for requester and target", () => {
    const calloff = request({ type: "calloff", status: "open" });
    expect(hasOpenRequest([calloff], "ana", "2026-10-26")).toBe(true);
    expect(hasOpenRequest([calloff], "ana", "2026-10-27")).toBe(false);
    const swap = request({ type: "swap", targetEmpId: "ben", targetShiftDate: "2026-10-28" });
    expect(hasOpenRequest([swap], "ben", "2026-10-28")).toBe(true);
    expect(hasOpenRequest([request({ status: "rejected" })], "ana", "2026-10-26")).toBe(false);
  });
});

describe("planSuggestionWrites", () => {
  const snapshot = (assignmentIds: number[]) => worked(assignmentIds).effective!;
  const entry = (published: number[] | null, effective: number[]): ScheduleCellStateEntry => ({
    ...worked(effective),
    published: published ? snapshot(published) : null,
    effective: snapshot(effective),
  });
  const suggestion = (kind: CoverageSuggestion["kind"], dates: string[]): CoverageSuggestion => ({
    id: kind,
    kind,
    employeeId: "ana",
    requestId: null,
    final: false,
    subject: {
      rowKey: "7:10:1",
      focusAreaId: 7,
      assignmentId: DAY,
      dateKey: dates[0],
      otherDateKey: dates[1] ?? null,
      otherAssignmentIds: [],
    },
    targets: [],
    overrides: dates.map((dateKey) => ({
      employeeId: "ana",
      dateKey,
      side: "draft" as const,
      day: {
        assignmentIds: [],
        mentoredAssignmentIds: [],
        absenceTypeId: null,
        restOfDayAbsenceTypeId: null,
      },
    })),
    effects: [],
    closes: 1,
    filled: 1,
    clearsOver: 0,
  });
  const noAssign = () => null;

  it("returns each day of a move back to its published state, and remembers the draft for Undo", () => {
    const shifts = {
      "ana_2026-10-26": entry([DAY], []),
      "ana_2026-10-27": entry(null, [DAY]),
    };
    const plan = planSuggestionWrites(
      suggestion("moveBack", ["2026-10-26", "2026-10-27"]),
      shifts,
      noAssign,
    );

    expect(
      plan?.writes.map((write) => [
        write.dateKey,
        write.input?.segments.map((s) => s.shiftId) ?? null,
      ]),
    ).toEqual([
      ["2026-10-26", [1]],
      ["2026-10-27", null],
    ]);
    expect(
      plan?.before.map((write) => [write.dateKey, write.input?.segments.length ?? null]),
    ).toEqual([
      ["2026-10-26", 0],
      ["2026-10-27", 1],
    ]);
  });

  it("restores a removed shift and undoes to an empty day when nothing was there", () => {
    const plan = planSuggestionWrites(
      suggestion("restore", ["2026-10-26"]),
      { "ana_2026-10-26": entry([DAY], []) },
      noAssign,
    );
    expect(plan?.writes[0].input).toMatchObject({
      kind: "worked",
      segments: [{ shiftId: 1, jobId: 10 }],
    });

    const empty = planSuggestionWrites(suggestion("restore", ["2026-10-28"]), {}, noAssign);
    expect(empty?.before[0].input).toBeNull();
  });

  it("schedules through the given builder, and gives up when it can no longer build", () => {
    const built = {
      kind: "worked" as const,
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    };
    expect(
      planSuggestionWrites(suggestion("assign", ["2026-10-26"]), {}, () => built)?.writes[0].input,
    ).toBe(built);
    expect(planSuggestionWrites(suggestion("assign", ["2026-10-26"]), {}, noAssign)).toBeNull();
  });
});

describe("planUndo", () => {
  const asInput = (entry: ScheduleCellStateEntry) => scheduleCellSnapshotToInput(entry.effective);
  const write = (dateKey: string, entry: ScheduleCellStateEntry | null) => ({
    employeeId: "ana",
    dateKey,
    input: entry ? asInput(entry) : null,
  });
  // The build wrote a Day shift on Monday and emptied Tuesday.
  const applied = {
    writes: [write("2026-10-26", worked([DAY])), write("2026-10-27", null)],
    before: [write("2026-10-26", null), write("2026-10-27", worked([EVENING]))],
  };

  it("puts back every cell that still holds what was written", () => {
    const shifts = { "ana_2026-10-26": worked([DAY]) };
    expect(planUndo(applied, shifts)).toEqual({ restore: applied.before, kept: 0 });
  });

  it("keeps a cell someone changed since, and counts it", () => {
    const shifts = {
      "ana_2026-10-26": worked([DAY], { mentored: [true] }),
      "ana_2026-10-27": { ...worked([NIGHT]) },
    };
    expect(planUndo(applied, shifts)).toEqual({ restore: [], kept: 2 });
  });

  it("treats a deleted cell as empty", () => {
    const shifts = {
      "ana_2026-10-26": worked([DAY]),
      "ana_2026-10-27": { ...worked([EVENING]), isDelete: true },
    };
    expect(planUndo(applied, shifts).restore).toEqual(applied.before);
  });
});

describe("weekHoursWithPlanned", () => {
  const plannedDay = (dateKey: string, assignmentIds: number[]): CoverageDayOverride => ({
    employeeId: "ana",
    dateKey,
    side: "draft",
    day: {
      assignmentIds,
      mentoredAssignmentIds: [],
      absenceTypeId: null,
      restOfDayAbsenceTypeId: null,
    },
  });
  const shorter = { ...worked([DAY]), customStartTime: "07:00", customEndTime: "11:00" };
  const shifts = {
    "ana_2026-10-25": worked([DAY]),
    "ana_2026-10-26": shorter,
    "ana_2026-10-27": absent(4),
    "ana_2026-11-01": worked([DAY]),
    "ben_2026-10-28": worked([DAY]),
  };
  const weekHours = weekHoursWithPlanned({ shifts, assignments, shiftCategories });

  it("counts the person's own Sunday-to-Saturday week, with their custom times", () => {
    // Sunday 8 and Monday's custom 4; the absence has no hours, next Sunday is another week.
    expect(weekHours("ana", "2026-10-28", [])).toBe(12);
    expect(weekHours("ana", "2026-10-31", [])).toBe(12);
    expect(weekHours("ana", "2026-11-01", [])).toBe(8);
  });

  it("adds planned days and replaces the days they rewrite", () => {
    const planned = [
      plannedDay("2026-10-28", [NIGHT]),
      plannedDay("2026-10-26", [EVENING]),
      { ...plannedDay("2026-10-29", [DAY]), employeeId: "ben" },
    ];
    // Sunday 8, Monday now an Evening at its usual 8, Wednesday's Night 8.5.
    expect(weekHours("ana", "2026-10-26", planned)).toBe(24.5);
  });

  it("keeps a day's custom times when a planned day leaves its shifts as they are", () => {
    expect(weekHours("ana", "2026-10-26", [plannedDay("2026-10-26", [DAY])])).toBe(12);
  });
});

describe("fairnessStandingWithPlanned", () => {
  const PERIOD = ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-31"];
  const shifts = {
    "ana_2026-10-25": worked([DAY]),
    "ana_2026-10-26": worked([NIGHT]),
    "ana_2026-10-28": absent(4),
  };
  const history = {
    "ana_2026-10-17": worked([DAY]),
    "ana_2026-10-24": worked([NIGHT]),
    "ana_2026-10-21": absent(4),
    "ben_2026-10-24": worked([EVENING]),
  };
  const standing = fairnessStandingWithPlanned(
    { shifts, assignments, shiftCategories },
    PERIOD,
    history,
  );
  const nightOn = (dateKey: string): CoverageDayOverride => ({
    employeeId: "ana",
    dateKey,
    side: "draft",
    day: {
      assignmentIds: [NIGHT],
      mentoredAssignmentIds: [],
      absenceTypeId: null,
      restOfDayAbsenceTypeId: null,
    },
  });

  it("knows a night shift by its start", () => {
    expect(isNightAssignment(assignments[2], shiftCategories)).toBe(true);
    expect(isNightAssignment(assignments[1], shiftCategories)).toBe(false);
    expect(isNightAssignment(undefined, shiftCategories)).toBe(false);
  });

  it("counts weekends over history and the period for a weekend shift", () => {
    // History: two Saturdays; the period: Sunday. Hours: Sunday 8 and Monday's night 8.5.
    expect(standing("ana", "2026-10-31", DAY, [])).toEqual({
      preference: "none",
      splitsDaysOff: false,
      weekends: 3,
      nights: null,
      hours: 16.5,
    });
    expect(standing("ben", "2026-10-31", DAY, [])).toEqual({
      preference: "none",
      splitsDaysOff: false,
      weekends: 1,
      nights: null,
      hours: 0,
    });
  });

  it("counts nights with the planned days written for a night shift", () => {
    expect(standing("ana", "2026-10-27", NIGHT, [nightOn("2026-10-27")])).toEqual({
      preference: "none",
      splitsDaysOff: false,
      weekends: null,
      nights: 3,
      hours: 25,
    });
  });
});

describe("days in a row", () => {
  // Ana works Tuesday, Oct 20 to Saturday, Oct 24: five days in a row.
  const fiveDays = Object.fromEntries(
    ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].map((dateKey) => [
      `ana_${dateKey}`,
      worked([DAY]),
    ]),
  );
  const input = { shifts: fiveDays, assignments, shiftCategories, loadedDateKeys: LOADED };
  const planDay = (dateKey: string, ids: number[]): CoverageDayOverride => ({
    employeeId: "ana",
    dateKey,
    side: "draft",
    day: {
      assignmentIds: ids,
      mentoredAssignmentIds: [],
      absenceTypeId: null,
      restOfDayAbsenceTypeId: null,
    },
  });

  it("counts the days worked on both sides", () => {
    const worked = (dateKey: string) => fiveDays[`ana_${dateKey}`] != null;
    expect(daysInARowWith(worked, "2026-10-25")).toBe(6);
    expect(daysInARowWith(worked, "2026-10-19")).toBe(6);
    expect(daysInARowWith(worked, "2026-10-27")).toBe(1);
  });

  it("rules out a sixth day in a row, across the period's start", () => {
    expect(availabilityFromShifts(input, "ana", "2026-10-25", DAY)).toEqual({
      kind: "workRun",
      days: 6,
    });
    expect(availabilityFromShifts(input, "ana", "2026-10-26", DAY).kind).not.toBe("workRun");
  });

  it("allows a second shift on a day already worked", () => {
    expect(availabilityFromShifts(input, "ana", "2026-10-24", EVENING).kind).not.toBe("workRun");
  });

  it("counts planned days, and a planned day off breaks the run", () => {
    const shortRun = { ...input, shifts: { "ana_2026-10-21": worked([DAY]) } };
    const planned = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((dateKey) =>
      planDay(dateKey, [DAY]),
    );
    expect(availabilityWithPlanned(shortRun, planned)("ana", "2026-10-26", DAY)).toEqual({
      kind: "workRun",
      days: 6,
    });
    const withDayOff = [...planned.slice(0, 3), planDay("2026-10-25", [])];
    expect(availabilityWithPlanned(shortRun, withDayOff)("ana", "2026-10-26", DAY).kind).not.toBe(
      "workRun",
    );
  });

  it("allows a sixth day but never a seventh when the scheduler allows it", () => {
    const stretched = { ...input, maxDaysInARow: 6 };
    expect(availabilityFromShifts(stretched, "ana", "2026-10-25", DAY).kind).not.toBe("workRun");
    const sixDays = { ...fiveDays, "ana_2026-10-25": worked([DAY]) };
    expect(
      availabilityFromShifts({ ...stretched, shifts: sixDays }, "ana", "2026-10-26", DAY),
    ).toEqual({ kind: "workRun", days: 7 });
  });

  it("names the planned days that go past five in a row", () => {
    expect(
      daysPastUsualLimit(fiveDays, [planDay("2026-10-25", [DAY]), planDay("2026-10-27", [DAY])]),
    ).toEqual({ runs: [{ employeeId: "ana", dateKey: "2026-10-25" }], weeks: [] });
    expect(daysPastUsualLimit(fiveDays, [planDay("2026-10-25", [])])).toEqual({
      runs: [],
      weeks: [],
    });
  });

  it("names the weeks a plan gives someone a sixth day", () => {
    const weekdays = Object.fromEntries(
      ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((dateKey) => [
        `ana_${dateKey}`,
        worked([DAY]),
      ]),
    );
    expect(daysPastUsualLimit(weekdays, [planDay("2026-10-31", [DAY])]).weeks).toEqual([
      { employeeId: "ana", weekStart: "2026-10-25" },
    ]);
  });

  describe("days in a week", () => {
    // Ana works Sunday, Oct 25 to Thursday, Oct 29; Friday is off.
    const weekdays = Object.fromEntries(
      ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((dateKey) => [
        `ana_${dateKey}`,
        worked([DAY]),
      ]),
    );
    const weekInput = { ...input, shifts: weekdays };

    it("rules out a sixth day in a Sunday-to-Saturday week, even after a day off", () => {
      expect(availabilityFromShifts(weekInput, "ana", "2026-10-31", DAY)).toEqual({
        kind: "workWeek",
        days: 6,
      });
      // The next week starts again.
      expect(availabilityFromShifts(weekInput, "ana", "2026-11-02", DAY).kind).not.toBe("workWeek");
    });

    it("allows a sixth day in a week when the scheduler allows 6", () => {
      const allowed = { ...weekInput, maxDaysInAWeek: 6, maxDaysInARow: 6 };
      expect(availabilityFromShifts(allowed, "ana", "2026-10-31", DAY).kind).not.toBe("workWeek");
    });

    it("leaves out a recurring shift that would make a sixth day in the week", () => {
      const fill = {
        employeeId: "ana",
        dateKey: "2026-10-31",
        input: scheduleCellSnapshotToInput(worked([DAY]).effective)!,
      };
      expect(limitRecurringRuns([fill], weekdays).skipped).toEqual([
        { employeeId: "ana", dateKey: "2026-10-31", days: 6, limit: "week" },
      ]);
      expect(limitRecurringRuns([fill], weekdays, { maxDaysInAWeek: 6 }).kept).toEqual([fill]);
    });
  });

  describe("double shifts", () => {
    it("never adds a second shift on a worked day when planning a build", () => {
      const planning = { ...input, noDoubleShifts: true };
      expect(availabilityFromShifts(planning, "ana", "2026-10-24", EVENING)).toEqual({
        kind: "doubleShift",
      });
      expect(
        availabilityWithPlanned({ ...planning, shifts: {} }, [planDay("2026-10-27", [DAY])])(
          "ana",
          "2026-10-27",
          EVENING,
        ),
      ).toEqual({ kind: "doubleShift" });
    });

    it("still lets a single suggestion offer one", () => {
      expect(availabilityFromShifts(input, "ana", "2026-10-24", EVENING).kind).not.toBe(
        "doubleShift",
      );
    });
  });

  it("leaves out a recurring shift that would make a sixth day, and keeps absences", () => {
    const fill = (dateKey: string, kind: "worked" | "absence") => ({
      employeeId: "ana",
      dateKey,
      input:
        kind === "worked"
          ? scheduleCellSnapshotToInput(worked([DAY]).effective)!
          : scheduleCellSnapshotToInput(absent(4).effective)!,
    });
    const shortRun = { "ana_2026-10-20": worked([DAY]), "ana_2026-10-21": worked([DAY]) };
    const fills = [
      fill("2026-10-25", "worked"),
      fill("2026-10-22", "worked"),
      fill("2026-10-23", "worked"),
      fill("2026-10-24", "worked"),
      fill("2026-10-26", "absence"),
    ];
    const { kept, skipped } = limitRecurringRuns(fills, shortRun);

    expect(kept.map((item) => item.dateKey)).toEqual([
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-26",
    ]);
    expect(skipped).toEqual([{ employeeId: "ana", dateKey: "2026-10-25", days: 6, limit: "row" }]);
  });
});

describe("days off in pairs", () => {
  const PERIOD = ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];
  const standingFor = (shifts: Record<string, ScheduleCellStateEntry>) =>
    fairnessStandingWithPlanned({ shifts, assignments, shiftCategories }, PERIOD);

  it("marks a shift that would leave a single day off between work days", () => {
    // Works Sunday; Tuesday would leave Monday alone.
    const standing = standingFor({ "ana_2026-10-25": worked([DAY]) });
    expect(standing("ana", "2026-10-27", DAY, []).splitsDaysOff).toBe(true);
    expect(standing("ana", "2026-10-26", DAY, []).splitsDaysOff).toBe(false);
    expect(standing("ana", "2026-10-28", DAY, []).splitsDaysOff).toBe(false);
  });

  it("does not mark a second shift on a day already worked", () => {
    const standing = standingFor({
      "ana_2026-10-25": worked([DAY]),
      "ana_2026-10-27": worked([DAY]),
    });
    expect(standing("ana", "2026-10-27", EVENING, []).splitsDaysOff).toBe(false);
  });
});

describe("weekDaysWithPlanned", () => {
  it("counts the week's worked days, planned days included and planned removals not", () => {
    const weekDays = weekDaysWithPlanned(
      {
        shifts: {
          "ana_2026-10-25": worked([DAY]),
          "ana_2026-10-26": worked([DAY]),
          "ana_2026-11-01": worked([DAY]),
        },
      },
      4,
    );
    const planned: CoverageDayOverride[] = [
      {
        employeeId: "ana",
        dateKey: "2026-10-28",
        side: "draft",
        day: {
          assignmentIds: [DAY],
          mentoredAssignmentIds: [],
          absenceTypeId: null,
          restOfDayAbsenceTypeId: null,
        },
      },
      {
        employeeId: "ana",
        dateKey: "2026-10-26",
        side: "draft",
        day: {
          assignmentIds: [],
          mentoredAssignmentIds: [],
          absenceTypeId: 4,
          restOfDayAbsenceTypeId: null,
        },
      },
    ];

    expect(weekDaysWithPlanned({ shifts: {} }, 4)("ana", "2026-10-27", [])).toBe(0);
    expect(
      weekDaysWithPlanned({ shifts: { "ana_2026-10-25": worked([DAY]) } }, 4)(
        "ana",
        "2026-10-31",
        [],
      ),
    ).toBe(1);
    expect(weekDays("ana", "2026-10-27", planned)).toBe(2);
  });

  it("counts another absence as a day of the week, but not the day off absence", () => {
    const shifts = {
      "ana_2026-10-26": worked([DAY]),
      "ana_2026-10-27": absent(7),
      "ana_2026-10-28": absent(4),
    };
    expect(weekDaysWithPlanned({ shifts }, 4)("ana", "2026-10-27", [])).toBe(2);
    expect(weekDaysWithPlanned({ shifts }, null)("ana", "2026-10-27", [])).toBe(3);
  });
});

describe("workLimitWith", () => {
  // Mon to Fri worked, Oct 26 to 30.
  const worked = (dateKey: string) => dateKey >= "2026-10-26" && dateKey <= "2026-10-30";

  it("refuses a sixth day in a week or in a row, and allows it with 6 days", () => {
    expect(workLimitWith({})("ana", "2026-10-31", worked)).toEqual({ kind: "workRun", days: 6 });
    expect(
      workLimitWith({ maxDaysInARow: 6, maxDaysInAWeek: 6 })("ana", "2026-10-31", worked),
    ).toBeNull();
  });

  it("adds no day for a day already worked, even when doubles are refused", () => {
    expect(workLimitWith({ noDoubleShifts: true })("ana", "2026-10-28", worked)).toBeNull();
  });
});

describe("planDaysOff", () => {
  // Sunday Oct 25 to Saturday Oct 31.
  const WEEK = [
    "2026-10-25",
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
  ];
  const OFF = 133;
  const VACATION = 4;
  const plannedShift = (employeeId: string, dateKey: string): CoverageDayOverride => ({
    employeeId,
    dateKey,
    side: "draft",
    day: {
      assignmentIds: [DAY],
      mentoredAssignmentIds: [],
      absenceTypeId: null,
      restOfDayAbsenceTypeId: null,
    },
  });
  const workingOn = (employeeId: string, dateKeys: string[]) =>
    Object.fromEntries(dateKeys.map((dateKey) => [`${employeeId}_${dateKey}`, worked([DAY])]));
  const plan = (options: Partial<Parameters<typeof planDaysOff>[0]>) =>
    planDaysOff({
      shifts: {},
      planned: [],
      employeeIds: ["ana"],
      dateKeys: WEEK,
      absenceTypeId: OFF,
      todayKey: WEEK[0],
      ...options,
    });
  const keys = (days: { employeeId: string; dateKey: string }[]) =>
    days.map((day) => `${day.employeeId} ${day.dateKey}`);

  it("marks the empty days of a full week, including the build's own days", () => {
    const { writes, blanks } = plan({
      shifts: workingOn("ana", WEEK.slice(1, 4)),
      planned: [plannedShift("ana", WEEK[4]), plannedShift("ana", WEEK[5])],
    });
    expect(keys(writes)).toEqual(["ana 2026-10-25", "ana 2026-10-31"]);
    expect(writes[0].input).toMatchObject({ kind: "absence", absenceTypeId: OFF, segments: [] });
    expect(blanks).toEqual([]);
  });

  it("leaves one day blank for each day short of five, after the days off", () => {
    // Mon to Thu worked: 3 empty days, 1 short of 5.
    const { writes, blanks } = plan({ shifts: workingOn("ana", WEEK.slice(1, 5)) });
    expect(keys(writes)).toEqual(["ana 2026-10-30", "ana 2026-10-31"]);
    expect(keys(blanks)).toEqual(["ana 2026-10-25"]);
  });

  it("keeps the days off next to each other", () => {
    // Sun, Mon, Wed, Thu worked: Tue, Fri, Sat empty, 1 short.
    const { writes, blanks } = plan({
      shifts: workingOn("ana", [WEEK[0], WEEK[1], WEEK[3], WEEK[4]]),
    });
    expect(keys(writes)).toEqual(["ana 2026-10-30", "ana 2026-10-31"]);
    expect(keys(blanks)).toEqual(["ana 2026-10-27"]);
  });

  it("counts another absence as a workday it stands in for, and a day off already marked as off", () => {
    const { writes, blanks } = plan({
      shifts: {
        ...workingOn("ana", WEEK.slice(1, 4)),
        "ana_2026-10-29": absent(VACATION),
        "ana_2026-10-25": absent(OFF),
      },
    });
    // 3 worked and a vacation day: 1 short, so of Fri and Sat the later stays blank.
    expect(keys(writes)).toEqual(["ana 2026-10-30"]);
    expect(keys(blanks)).toEqual(["ana 2026-10-31"]);
  });

  it("gives two days off at most, leaving the rest blank, however few days are worked", () => {
    // Tue and Fri worked, as a two-day recurring schedule gives when nothing else fits.
    const { writes, blanks } = plan({ shifts: workingOn("ana", [WEEK[2], WEEK[5]]) });
    expect(writes).toHaveLength(2);
    expect(blanks).toHaveLength(3);
  });

  it("adds no day off to a week whose recurring schedule already gives two", () => {
    const { writes, blanks } = plan({
      shifts: {
        ...workingOn("ana", [WEEK[2], WEEK[5]]),
        "ana_2026-10-25": absent(OFF),
        "ana_2026-10-31": absent(OFF),
      },
    });
    expect(writes).toEqual([]);
    expect(keys(blanks)).toEqual(["ana 2026-10-26", "ana 2026-10-28", "ana 2026-10-29"]);
  });

  it("counts the whole week, but only marks the days given", () => {
    // Today is Wednesday: Sunday passed without work, then Mon to Wed worked.
    const { writes, blanks } = plan({
      shifts: workingOn("ana", [WEEK[1], WEEK[2], WEEK[3]]),
      dateKeys: WEEK.slice(3),
      todayKey: WEEK[3],
    });
    // 2 short, so Sunday and one more are the days off.
    expect(keys(writes)).toEqual(["ana 2026-10-29"]);
    expect(keys(blanks)).toEqual(["ana 2026-10-30", "ana 2026-10-31"]);
  });

  it("counts a day the build empties, and leaves it blank since nothing else may write it", () => {
    // Mon to Thu worked, Friday's shift having moved to Wednesday; the build moves it back.
    const emptied: CoverageDayOverride = { ...plannedShift("ana", WEEK[3]) };
    emptied.day = { ...emptied.day, assignmentIds: [] };
    const { writes, blanks } = plan({
      shifts: workingOn("ana", WEEK.slice(1, 5)),
      planned: [emptied, plannedShift("ana", WEEK[5])],
    });
    // Sun, Wed and Sat are empty and she is 1 short: Wed stays blank, Sun and Sat are off.
    expect(keys(writes)).toEqual(["ana 2026-10-25", "ana 2026-10-31"]);
    expect(keys(blanks)).toEqual(["ana 2026-10-28"]);
  });

  it("leaves people who work no day in the period alone", () => {
    expect(plan({ shifts: { "cat_2026-10-25": absent(4) }, employeeIds: ["cat"] })).toEqual({
      writes: [],
      blanks: [],
    });
  });
});

describe("shift preferences", () => {
  const input = (
    preferences: Record<string, { mode: "prefers" | "only"; shiftIds: number[] }>,
  ) => ({
    shifts: {},
    assignments,
    shiftCategories,
    loadedDateKeys: LOADED,
    preferences: new Map(Object.entries(preferences)),
  });

  it("rules out any other shift for someone who works only their chosen shifts", () => {
    const only = input({ ana: { mode: "only", shiftIds: [2] } });
    expect(availabilityFromShifts(only, "ana", "2026-10-26", DAY)).toEqual({ kind: "onlyShifts" });
    expect(availabilityFromShifts(only, "ana", "2026-10-26", EVENING).kind).not.toBe("onlyShifts");
    expect(availabilityFromShifts(only, "ben", "2026-10-26", DAY).kind).not.toBe("onlyShifts");
  });

  it("does not rule anyone out for a flexible preference", () => {
    const prefers = input({ ana: { mode: "prefers", shiftIds: [2] } });
    expect(availabilityFromShifts(prefers, "ana", "2026-10-26", DAY).kind).not.toBe("onlyShifts");
  });

  it("tells the standing whether the shift is one the person prefers", () => {
    const standing = fairnessStandingWithPlanned(
      input({ ana: { mode: "prefers", shiftIds: [2] }, ben: { mode: "only", shiftIds: [1] } }),
      ["2026-10-26"],
    );
    expect(standing("ana", "2026-10-26", EVENING, []).preference).toBe("match");
    expect(standing("ana", "2026-10-26", DAY, []).preference).toBe("other");
    expect(standing("cat", "2026-10-26", DAY, []).preference).toBe("none");
  });
});

describe("job preferences", () => {
  // Day shift, job 11 (say, Supervisor), beside the fixtures' job 10.
  const DAY_SUPERVISOR = 103;
  const input = (
    jobPreferences: Record<string, { mode: "prefers" | "only"; jobIds: number[] }>,
    preferences: Record<string, { mode: "prefers" | "only"; shiftIds: number[] }> = {},
  ) => ({
    shifts: {},
    assignments: [...assignments, { ...assignment(DAY_SUPERVISOR, 1), jobId: 11 }],
    shiftCategories,
    loadedDateKeys: LOADED,
    preferences: new Map(Object.entries(preferences)),
    jobPreferences: new Map(Object.entries(jobPreferences)),
  });

  it("rules out any other job for someone who works only their chosen jobs", () => {
    const only = input({ ana: { mode: "only", jobIds: [11] } });
    expect(availabilityFromShifts(only, "ana", "2026-10-26", DAY)).toEqual({ kind: "onlyJobs" });
    expect(availabilityFromShifts(only, "ana", "2026-10-26", DAY_SUPERVISOR).kind).toBe("free");
    expect(availabilityFromShifts(only, "ben", "2026-10-26", DAY).kind).toBe("free");
    const prefers = input({ ana: { mode: "prefers", jobIds: [11] } });
    expect(availabilityFromShifts(prefers, "ana", "2026-10-26", DAY).kind).toBe("free");
  });

  it("applies with a shift preference: only shifts and only jobs both rule out", () => {
    const both = input(
      { ana: { mode: "only", jobIds: [11] } },
      { ana: { mode: "only", shiftIds: [2] } },
    );
    expect(availabilityFromShifts(both, "ana", "2026-10-26", DAY_SUPERVISOR)).toEqual({
      kind: "onlyShifts",
    });
    expect(availabilityFromShifts(both, "ana", "2026-10-26", EVENING)).toEqual({
      kind: "onlyJobs",
    });
  });

  it("prefers someone only for a shift that matches every preference they set", () => {
    const standing = fairnessStandingWithPlanned(
      input(
        { ana: { mode: "prefers", jobIds: [11] }, ben: { mode: "prefers", jobIds: [11] } },
        { ben: { mode: "prefers", shiftIds: [2] } },
      ),
      ["2026-10-26"],
    );
    expect(standing("ana", "2026-10-26", DAY_SUPERVISOR, []).preference).toBe("match");
    expect(standing("ana", "2026-10-26", DAY, []).preference).toBe("other");
    // Ben prefers Supervisor and Evening: a Day Supervisor shift matches one, not both.
    expect(standing("ben", "2026-10-26", DAY_SUPERVISOR, []).preference).toBe("other");
    expect(standing("cat", "2026-10-26", DAY, []).preference).toBe("none");
  });
});
