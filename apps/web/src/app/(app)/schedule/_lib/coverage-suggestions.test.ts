import { describe, expect, it } from "vitest";
import type {
  AssignmentDefinition,
  ScheduleCellStateEntry,
  ShiftCategory,
  ShiftRequest,
} from "@/types";
import {
  availabilityFromShifts,
  draftDayFromShifts,
  hasOpenRequest,
  pendingPickupsFromRequests,
  planSuggestionWrites,
  planUndo,
  fairnessStandingWithPlanned,
  isNightAssignment,
  publishedDayFromShifts,
  weekHoursWithPlanned,
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
      weekends: 3,
      nights: null,
      hours: 16.5,
    });
    expect(standing("ben", "2026-10-31", DAY, [])).toEqual({ weekends: 1, nights: null, hours: 0 });
  });

  it("counts nights with the planned days written for a night shift", () => {
    expect(standing("ana", "2026-10-27", NIGHT, [nightOn("2026-10-27")])).toEqual({
      weekends: null,
      nights: 3,
      hours: 25,
    });
  });
});
