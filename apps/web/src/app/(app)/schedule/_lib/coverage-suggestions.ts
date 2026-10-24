import {
  MAX_DAYS_IN_A_ROW,
  MAX_DAYS_IN_A_WEEK,
  computeShiftSegmentHours,
  getScheduleWeekStartDate,
  parseLocalDateKey,
  type CoverageAvailability,
  type CoverageDayOverride,
  type CoverageFairnessRule,
  type CoverageOvertimeRule,
  type CoverageShiftPreference,
  type CoverageSkippedRecurring,
  type CoverageMatrix,
  type CoverageMeasureInput,
  type CoveragePickupRequest,
  type CoverageSuggestion,
  type CoverageSuggestionDay,
  type CoverageSuggestionInput,
  type CoverageSuggestionTextLookups,
  type CoverageTopUpRule,
} from "@dubgrid/schedule-core";
import type { Employee } from "@dubgrid/domain";
import type {
  AssignmentDefinition,
  JobDefinition,
  NamedItem,
  ShiftCategory,
  ScheduleCellInput,
  ShiftMap,
  ShiftRequest,
} from "@/types";
import { scheduleCellSnapshotToInput } from "@/lib/schedule-cells";
import { isEmployeeQualifiedForAssignmentDefinition } from "@/lib/assignable-shifts";
import { checkCrossDateOverlap, timesOverlap } from "@/lib/schedule-logic";
import { addDays, formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import { formatShortDate } from "@/components/coverage-check/coverage-check-text";
import {
  assignmentTimeRange,
  getStaffingStateAlignedTimeRanges,
  staffingStateFromEntry,
} from "./open-shift-staffing";

const EMPTY_DAY: CoverageSuggestionDay = {
  assignmentIds: [],
  mentoredAssignmentIds: [],
  absenceTypeId: null,
  restOfDayAbsenceTypeId: null,
};

const OPEN_STATUSES = new Set(["open", "pending_approval"]);

export interface CoverageSuggestionAdapterInput {
  matrix: CoverageMatrix;
  coverage: CoverageMeasureInput["coverage"];
  mentoredCredit: number;
  shifts: ShiftMap;
  employees: Employee[];
  /** Every definition, archived ones included, so old work can still be named. */
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  orgRoles?: NamedItem[];
  requests: ShiftRequest[];
  focusAreaNames: ReadonlyMap<number, string>;
  assignmentNames: ReadonlyMap<number, string>;
  absenceNames: ReadonlyMap<number, string>;
  /** Every date the page has loaded, first to last. */
  loadedDateKeys: string[];
  /** Each person's shift preference, by employee id; people without one are left out. */
  preferences?: ReadonlyMap<string, CoverageShiftPreference>;
  /** Days in a row allowed; the usual limit unless the scheduler allows 6 days. */
  maxDaysInARow?: number;
  /** Days in a week allowed; the usual limit unless the scheduler allows 6 days. */
  maxDaysInAWeek?: number;
  /** Planning a build or Apply all: never a second shift on a day already worked. */
  noDoubleShifts?: boolean;
}

/** The shift an assignment belongs to, for matching a preference. */
function shiftOfAssignment(assignment: AssignmentDefinition | undefined): number | null {
  return assignment?.shiftId ?? assignment?.categoryId ?? null;
}

function mentoredOf(
  assignmentIds: number[],
  segments: ReadonlyArray<{ isMentored?: boolean }> | undefined,
): number[] {
  return assignmentIds.filter((_, index) => segments?.[index]?.isMentored === true);
}

/** The draft day, read from the same fields the matrix counts. A deleted draft is an empty day. */
export function draftDayFromShifts(
  shifts: ShiftMap,
  employeeId: string,
  dateKey: string,
): CoverageSuggestionDay {
  const entry = shifts[`${employeeId}_${dateKey}`];
  if (!entry || entry.isDelete) return EMPTY_DAY;
  return {
    assignmentIds: entry.assignmentIds,
    mentoredAssignmentIds: mentoredOf(entry.assignmentIds, entry.segments),
    absenceTypeId: entry.absenceTypeId ?? null,
    restOfDayAbsenceTypeId: entry.restOfDayAbsenceTypeId ?? null,
  };
}

export function publishedDayFromShifts(
  shifts: ShiftMap,
  employeeId: string,
  dateKey: string,
): CoverageSuggestionDay {
  const entry = shifts[`${employeeId}_${dateKey}`];
  if (!entry) return EMPTY_DAY;
  const assignmentIds = entry.publishedAssignmentDefinitionIds ?? [];
  return {
    assignmentIds,
    mentoredAssignmentIds: mentoredOf(assignmentIds, entry.publishedSegments),
    absenceTypeId: entry.publishedAbsenceTypeId ?? null,
    restOfDayAbsenceTypeId: entry.publishedRestOfDayAbsenceTypeId ?? null,
  };
}

/** Pickups for an open shift, waiting for a manager: the same filter as the open-shifts row. */
export function pendingPickupsFromRequests(requests: ShiftRequest[]): CoveragePickupRequest[] {
  return requests.flatMap((request) =>
    request.type === "pickup" &&
    request.status === "pending_approval" &&
    request.targetEmpId == null &&
    request.parentRequestId == null &&
    request.requesterFocusAreaId != null
      ? [
          {
            requestId: request.id,
            employeeId: request.requesterEmpId,
            dateKey: request.requesterShiftDate,
            focusAreaId: request.requesterFocusAreaId,
            assignmentIds: request.requesterAssignmentDefinitionIds,
          },
        ]
      : [],
  );
}

export function hasOpenRequest(
  requests: ShiftRequest[],
  employeeId: string,
  dateKey: string,
): boolean {
  return requests.some(
    (request) =>
      OPEN_STATUSES.has(request.status) &&
      ((request.requesterEmpId === employeeId && request.requesterShiftDate === dateKey) ||
        (request.targetEmpId === employeeId && request.targetShiftDate === dateKey)),
  );
}

/** Whether the person works a day: a planned day first, then the draft. */
function workedWith(
  shifts: ShiftMap,
  planned: ReadonlyArray<CoverageDayOverride>,
  employeeId: string,
): (dateKey: string) => boolean {
  const plannedDays = new Map<string, boolean>();
  for (const override of planned) {
    if (override.side === "draft" && override.employeeId === employeeId) {
      plannedDays.set(override.dateKey, override.day.assignmentIds.length > 0);
    }
  }
  return (dateKey) => {
    const plannedDay = plannedDays.get(dateKey);
    if (plannedDay != null) return plannedDay;
    const entry = shifts[`${employeeId}_${dateKey}`];
    return entry != null && !entry.isDelete && entry.assignmentIds.length > 0;
  };
}

/** How many days in a row the person works with this day worked, counted both ways. */
export function daysInARowWith(worked: (dateKey: string) => boolean, dateKey: string): number {
  const date = parseLocalDateKey(dateKey);
  const reach = MAX_DAYS_IN_A_ROW * 2;
  let days = 1;
  for (
    let offset = -1;
    offset >= -reach && worked(formatDateKey(addDays(date, offset)));
    offset -= 1
  ) {
    days += 1;
  }
  for (
    let offset = 1;
    offset <= reach && worked(formatDateKey(addDays(date, offset)));
    offset += 1
  ) {
    days += 1;
  }
  return days;
}

/** How many days the person works in the Sunday-to-Saturday week holding a date, with that date worked. */
export function daysInWeekWith(worked: (dateKey: string) => boolean, dateKey: string): number {
  const date = parseLocalDateKey(dateKey);
  const sunday = addDays(date, -date.getDay());
  let days = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const key = formatDateKey(addDays(sunday, offset));
    if (key === dateKey || worked(key)) days += 1;
  }
  return days;
}

/** The limits on a person's work a build or suggestion must keep. */
export interface WorkLimits {
  maxDaysInARow?: number;
  maxDaysInAWeek?: number;
  /** Planning a build: never a second shift on a day already worked. */
  noDoubleShifts?: boolean;
}

/** Why working this day would break a limit, or null. A day already worked adds no days. */
function overWorkLimits(
  worked: (dateKey: string) => boolean,
  dateKey: string,
  limits: WorkLimits,
): CoverageAvailability | null {
  if (worked(dateKey)) return limits.noDoubleShifts ? { kind: "doubleShift" } : null;
  const run = daysInARowWith(worked, dateKey);
  if (run > (limits.maxDaysInARow ?? MAX_DAYS_IN_A_ROW)) return { kind: "workRun", days: run };
  const week = daysInWeekWith(worked, dateKey);
  if (week > (limits.maxDaysInAWeek ?? MAX_DAYS_IN_A_WEEK)) return { kind: "workWeek", days: week };
  return null;
}

/** The limits as a restore or move back checks them: a day already worked adds no days. */
export function workLimitWith(
  limits: WorkLimits,
): NonNullable<CoverageSuggestionInput["workLimit"]> {
  return (_employeeId, dateKey, worked) =>
    overWorkLimits(worked, dateKey, { ...limits, noDoubleShifts: false });
}

/**
 * Where a plan goes past the usual limits: each planned day in a run longer
 * than five, and each week with more than five days worked.
 */
export function daysPastUsualLimit(
  shifts: ShiftMap,
  planned: ReadonlyArray<CoverageDayOverride>,
): {
  runs: { employeeId: string; dateKey: string }[];
  weeks: { employeeId: string; weekStart: string }[];
} {
  const byPerson = new Map<string, CoverageDayOverride[]>();
  for (const day of planned) {
    if (day.side !== "draft") continue;
    byPerson.set(day.employeeId, [...(byPerson.get(day.employeeId) ?? []), day]);
  }
  const runs: { employeeId: string; dateKey: string }[] = [];
  const weeks = new Map<string, { employeeId: string; weekStart: string }>();
  for (const [employeeId, days] of byPerson) {
    const worked = workedWith(shifts, days, employeeId);
    for (const day of days) {
      if (day.day.assignmentIds.length === 0) continue;
      if (daysInARowWith(worked, day.dateKey) > MAX_DAYS_IN_A_ROW) {
        runs.push({ employeeId, dateKey: day.dateKey });
      }
      if (daysInWeekWith(worked, day.dateKey) > MAX_DAYS_IN_A_WEEK) {
        const date = parseLocalDateKey(day.dateKey);
        const weekStart = formatDateKey(addDays(date, -date.getDay()));
        weeks.set(`${employeeId}|${weekStart}`, { employeeId, weekStart });
      }
    }
  }
  return {
    runs: runs.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    weeks: [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
  };
}

/**
 * Recurring fills in date order, leaving out any shift that would make more
 * days in a row than the limit once the earlier fills are in.
 */
export function limitRecurringRuns<
  F extends { employeeId: string; dateKey: string; input: ScheduleCellInput },
>(
  fills: ReadonlyArray<F>,
  shifts: ShiftMap,
  limits: WorkLimits = {},
): { kept: F[]; skipped: CoverageSkippedRecurring[] } {
  const kept: F[] = [];
  const skipped: CoverageSkippedRecurring[] = [];
  const accepted = new Map<string, CoverageDayOverride[]>();
  for (const fill of [...fills].sort((a, b) => a.dateKey.localeCompare(b.dateKey))) {
    const works = fill.input.kind === "worked" && fill.input.segments.length > 0;
    const planned = accepted.get(fill.employeeId) ?? [];
    if (works) {
      const over = overWorkLimits(workedWith(shifts, planned, fill.employeeId), fill.dateKey, {
        ...limits,
        noDoubleShifts: false,
      });
      if (over?.kind === "workRun" || over?.kind === "workWeek") {
        skipped.push({
          employeeId: fill.employeeId,
          dateKey: fill.dateKey,
          days: over.days,
          limit: over.kind === "workWeek" ? "week" : "row",
        });
        continue;
      }
      planned.push({
        employeeId: fill.employeeId,
        dateKey: fill.dateKey,
        side: "draft",
        day: { ...EMPTY_DAY, assignmentIds: [0] },
      });
      accepted.set(fill.employeeId, planned);
    }
    kept.push(fill);
  }
  return { kept, skipped };
}

/**
 * Whether a person can take an assignment that day, by the Fill a spot
 * dialog's own rules, plus not on an absence: a suggestion never overrides
 * time off.
 */
export function availabilityFromShifts(
  input: Pick<
    CoverageSuggestionAdapterInput,
    | "shifts"
    | "assignments"
    | "shiftCategories"
    | "loadedDateKeys"
    | "preferences"
    | "maxDaysInARow"
  >,
  employeeId: string,
  dateKey: string,
  assignmentId: number,
): CoverageAvailability {
  const context = { assignments: input.assignments, shiftCategories: input.shiftCategories };
  const stateOn = (key: string) => staffingStateFromEntry(input.shifts[`${employeeId}_${key}`]);
  const state = stateOn(dateKey);
  if (state?.restOfDayAbsenceTypeId != null) {
    return { kind: "restOfDayAbsence", absenceTypeId: state.restOfDayAbsenceTypeId };
  }
  if (state?.kind === "absence" && state.absenceTypeId != null) {
    return { kind: "absence", absenceTypeId: state.absenceTypeId };
  }

  const assignment = input.assignments.find((candidate) => candidate.id === assignmentId);
  const preference = input.preferences?.get(employeeId);
  if (preference?.mode === "only") {
    const shiftId = shiftOfAssignment(assignment);
    if (shiftId == null || !preference.shiftIds.includes(shiftId)) return { kind: "onlyShifts" };
  }
  const range = assignment ? assignmentTimeRange(assignment, input.shiftCategories) : null;
  const sameDay = getStaffingStateAlignedTimeRanges(state, context);
  for (const [index, existing] of sameDay.entries()) {
    // Work with only a duration has no window to check, so it cannot be shown free.
    if (!existing || (range && timesOverlap([existing], [range]))) {
      return {
        kind: "overlap",
        dateKey,
        assignmentId: state?.assignmentIds[index] ?? assignmentId,
      };
    }
  }
  const over = overWorkLimits(workedWith(input.shifts, [], employeeId), dateKey, input);
  if (over) return over;
  if (!range) return { kind: "free" };

  const date = parseLocalDateKey(dateKey);
  const neighbours = [
    { key: formatDateKey(addDays(date, -1)), side: "prev" as const },
    { key: formatDateKey(addDays(date, 1)), side: "next" as const },
  ];
  for (const { key, side } of neighbours) {
    const neighbour = stateOn(key);
    const ranges = getStaffingStateAlignedTimeRanges(neighbour, context);
    for (const [index, existing] of ranges.entries()) {
      if (existing && checkCrossDateOverlap(range, { [side]: existing }).length > 0) {
        return {
          kind: "overlap",
          dateKey: key,
          assignmentId: neighbour?.assignmentIds[index] ?? assignmentId,
        };
      }
    }
  }
  const first = input.loadedDateKeys[0];
  const last = input.loadedDateKeys[input.loadedDateKeys.length - 1];
  for (const { key } of neighbours) {
    if (first == null || key < first || key > last) return { kind: "unverified", dateKey: key };
  }
  return { kind: "free" };
}

/**
 * Availability once Apply all's planned days are written: the page's own
 * check, then each planned shift's default times on that day and the days
 * either side, so a planned overnight shift still blocks the next morning.
 */
export function availabilityWithPlanned(
  input: Pick<
    CoverageSuggestionAdapterInput,
    | "shifts"
    | "assignments"
    | "shiftCategories"
    | "loadedDateKeys"
    | "preferences"
    | "maxDaysInARow"
  >,
  planned: ReadonlyArray<CoverageDayOverride>,
): (employeeId: string, dateKey: string, assignmentId: number) => CoverageAvailability {
  const rangeOf = (assignmentId: number) => {
    const assignment = input.assignments.find((candidate) => candidate.id === assignmentId);
    return assignment ? assignmentTimeRange(assignment, input.shiftCategories) : null;
  };
  return (employeeId, dateKey, assignmentId) => {
    const base = availabilityFromShifts(input, employeeId, dateKey, assignmentId);
    if (base.kind !== "free") return base;
    const range = rangeOf(assignmentId);
    const date = parseLocalDateKey(dateKey);
    const sideOf = new Map([
      [formatDateKey(addDays(date, -1)), "prev" as const],
      [formatDateKey(addDays(date, 1)), "next" as const],
    ]);
    for (const day of planned) {
      if (day.side !== "draft" || day.employeeId !== employeeId) continue;
      const side = sideOf.get(day.dateKey);
      if (day.dateKey !== dateKey && !side) continue;
      if (day.dateKey === dateKey && day.day.absenceTypeId != null) {
        return { kind: "absence", absenceTypeId: day.day.absenceTypeId };
      }
      for (const plannedId of day.day.assignmentIds) {
        const existing = rangeOf(plannedId);
        const overlaps =
          !existing ||
          !range ||
          (side
            ? checkCrossDateOverlap(range, { [side]: existing }).length > 0
            : timesOverlap([existing], [range]));
        if (overlaps) return { kind: "overlap", dateKey: day.dateKey, assignmentId: plannedId };
      }
    }
    return overWorkLimits(workedWith(input.shifts, planned, employeeId), dateKey, input) ?? base;
  };
}

type DraftHoursInput = Pick<
  CoverageSuggestionAdapterInput,
  "shifts" | "assignments" | "shiftCategories"
>;

/**
 * A person's draft days with the planned days written: each date's work and
 * its hours. A planned day takes its shifts' usual times unless it keeps the
 * day's own shifts unchanged.
 */
function draftDaysWithPlanned(input: DraftHoursInput) {
  const assignmentById = new Map(
    input.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const categoryById = new Map(input.shiftCategories.map((category) => [category.id, category]));
  return (
    employeeId: string,
    dateKeys: ReadonlyArray<string>,
    planned: ReadonlyArray<CoverageDayOverride>,
  ): { dateKey: string; assignmentIds: number[]; hours: number }[] => {
    const plannedDays = new Map<string, CoverageSuggestionDay>();
    for (const override of planned) {
      if (override.side === "draft" && override.employeeId === employeeId) {
        plannedDays.set(override.dateKey, override.day);
      }
    }
    return dateKeys.flatMap((dateKey) => {
      const entry = input.shifts[`${employeeId}_${dateKey}`];
      const saved = entry && !entry.isDelete ? entry.assignmentIds : [];
      const assignmentIds = plannedDays.get(dateKey)?.assignmentIds ?? saved;
      if (assignmentIds.length === 0) return [];
      const keepsTimes = assignmentIds.join(",") === saved.join(",");
      const hours = computeShiftSegmentHours(
        assignmentIds,
        assignmentById,
        keepsTimes ? entry?.customStartTime : null,
        keepsTimes ? entry?.customEndTime : null,
        categoryById,
      );
      return [{ dateKey, assignmentIds, hours }];
    });
  };
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/** A person's draft hours in the schedule week (Sunday to Saturday) holding a date. */
export function weekHoursWithPlanned(input: DraftHoursInput): CoverageOvertimeRule["weekHours"] {
  const daysOf = draftDaysWithPlanned(input);
  return (employeeId, dateKey, planned) => {
    const date = parseLocalDateKey(dateKey);
    const sunday = addDays(date, -date.getDay());
    const week = Array.from({ length: 7 }, (_, offset) => formatDateKey(addDays(sunday, offset)));
    return roundHours(daysOf(employeeId, week, planned).reduce((sum, day) => sum + day.hours, 0));
  };
}

/**
 * Days a person works or is away in the Sunday-to-Saturday week holding a
 * date, with the planned days written. Another absence, such as vacation,
 * stands in for a workday; the day off absence does not.
 */
export function weekDaysWithPlanned(
  input: Pick<CoverageSuggestionAdapterInput, "shifts">,
  dayOffAbsenceTypeId: number | null,
): CoverageTopUpRule["weekDays"] {
  return (employeeId, dateKey, planned) => {
    const worked = workedWith(input.shifts, planned, employeeId);
    const plannedDays = new Map(
      planned
        .filter((day) => day.side === "draft" && day.employeeId === employeeId)
        .map((day) => [day.dateKey, day.day]),
    );
    const away = (day: string) => {
      const entry = input.shifts[`${employeeId}_${day}`];
      const absence = plannedDays.has(day)
        ? plannedDays.get(day)!.absenceTypeId
        : entry && !entry.isDelete
          ? (entry.absenceTypeId ?? null)
          : null;
      return absence != null && absence !== dayOffAbsenceTypeId;
    };
    const date = parseLocalDateKey(dateKey);
    const sunday = addDays(date, -date.getDay());
    return Array.from({ length: 7 }, (_, offset) => formatDateKey(addDays(sunday, offset))).filter(
      (day) => worked(day) || away(day),
    ).length;
  };
}

function isWeekendDateKey(dateKey: string): boolean {
  const day = parseLocalDateKey(dateKey).getDay();
  return day === 0 || day === 6;
}

/** A night shift starts from 9 PM to before 5 AM. */
export function isNightAssignment(
  assignment: AssignmentDefinition | undefined,
  shiftCategories: ShiftCategory[],
): boolean {
  const range = assignment ? assignmentTimeRange(assignment, shiftCategories) : null;
  if (!range) return false;
  const [hour] = range.start.split(":").map(Number);
  return hour >= 21 || hour < 5;
}

/**
 * Each person's standing for a shift: weekend and night shifts over the
 * published history plus the draft period, and hours over the period, with
 * the planned days written. History holds published cells before the period.
 */
export function fairnessStandingWithPlanned(
  input: DraftHoursInput & Pick<CoverageSuggestionAdapterInput, "preferences">,
  periodDateKeys: ReadonlyArray<string>,
  history: ShiftMap = {},
): CoverageFairnessRule["standing"] {
  const daysOf = draftDaysWithPlanned(input);
  const assignmentById = new Map(
    input.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const night = new Map<number, boolean>();
  const isNight = (assignmentId: number) => {
    if (!night.has(assignmentId)) {
      night.set(
        assignmentId,
        isNightAssignment(assignmentById.get(assignmentId), input.shiftCategories),
      );
    }
    return night.get(assignmentId)!;
  };
  const past = new Map<string, { weekends: number; nights: number }>();
  for (const [key, entry] of Object.entries(history)) {
    const separator = key.lastIndexOf("_");
    const employeeId = key.slice(0, separator);
    const dateKey = key.slice(separator + 1);
    const worked = entry.publishedAssignmentDefinitionIds ?? [];
    if (worked.length === 0) continue;
    const counts = past.get(employeeId) ?? { weekends: 0, nights: 0 };
    if (isWeekendDateKey(dateKey)) counts.weekends += 1;
    if (worked.some(isNight)) counts.nights += 1;
    past.set(employeeId, counts);
  }
  return (employeeId, dateKey, assignmentId, planned) => {
    const days = daysOf(employeeId, periodDateKeys, planned);
    const before = past.get(employeeId) ?? { weekends: 0, nights: 0 };
    const worked = workedWith(input.shifts, planned, employeeId);
    const date = parseLocalDateKey(dateKey);
    const on = (offset: number) => worked(formatDateKey(addDays(date, offset)));
    const preference = input.preferences?.get(employeeId);
    const preferred = shiftOfAssignment(assignmentById.get(assignmentId));
    return {
      preference: !preference
        ? "none"
        : preferred != null && preference.shiftIds.includes(preferred)
          ? "match"
          : "other",
      // A single day off left between work days on either side.
      splitsDaysOff: !on(0) && ((!on(-1) && on(-2)) || (!on(1) && on(2))),
      weekends: isWeekendDateKey(dateKey)
        ? before.weekends + days.filter((day) => isWeekendDateKey(day.dateKey)).length
        : null,
      nights: isNight(assignmentId)
        ? before.nights + days.filter((day) => day.assignmentIds.some(isNight)).length
        : null,
      hours: roundHours(days.reduce((sum, day) => sum + day.hours, 0)),
    };
  };
}

/** Every way to pick `size` of the items, in order. */
function combinations<T>(items: ReadonlyArray<T>, size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest]),
  );
}

/**
 * Which of a week's empty days get the day off absence, leaving `blanks` of
 * them blank: the days that sit next to the most days off, then the earliest,
 * so days off stay together and the blanks come last. A week has at most
 * seven empty days, so every choice is tried.
 */
function chooseDaysOff(
  empty: ReadonlyArray<string>,
  blanks: number,
  isOff: (dateKey: string) => boolean,
): string[] {
  let best: { days: string[]; together: number } | null = null;
  for (const days of combinations(empty, empty.length - blanks)) {
    const together = days.filter((dateKey) => {
      const date = parseLocalDateKey(dateKey);
      return [-1, 1].some((offset) => {
        const key = formatDateKey(addDays(date, offset));
        return days.includes(key) || isOff(key);
      });
    }).length;
    if (!best || together > best.together) best = { days, together };
  }
  return best?.days ?? [];
}

/**
 * The day off absence for the empty days of everyone who works in the period
 * once the build's days are written, leaving one day blank for each day a
 * week they are short of five, so they have two days off at most. Only days not yet past, never a
 * cell that holds anything or that the build writes; a day the build empties,
 * such as a move back's other end, counts as empty but can only stay blank.
 */
export function planDaysOff(input: {
  shifts: ShiftMap;
  planned: ReadonlyArray<CoverageDayOverride>;
  employeeIds: ReadonlyArray<string>;
  dateKeys: ReadonlyArray<string>;
  absenceTypeId: number;
  /** Days before this have passed, so one without work was a day off. */
  todayKey: string;
}): {
  writes: { employeeId: string; dateKey: string; input: ScheduleCellInput }[];
  blanks: { employeeId: string; dateKey: string }[];
} {
  const writes: { employeeId: string; dateKey: string; input: ScheduleCellInput }[] = [];
  const blanks: { employeeId: string; dateKey: string }[] = [];
  for (const employeeId of input.employeeIds) {
    const planned = input.planned.filter(
      (day) => day.side === "draft" && day.employeeId === employeeId,
    );
    const worked = workedWith(input.shifts, planned, employeeId);
    if (!input.dateKeys.some(worked)) continue;
    const plannedDays = new Map(planned.map((day) => [day.dateKey, day.day]));
    const absenceOn = (dateKey: string): number | null => {
      if (plannedDays.has(dateKey)) return plannedDays.get(dateKey)!.absenceTypeId;
      const entry = input.shifts[`${employeeId}_${dateKey}`];
      return entry && !entry.isDelete ? (entry.absenceTypeId ?? null) : null;
    };
    // Writable: nothing saved or planned. A planned day left with nothing is empty too.
    const isWritable = (dateKey: string) => {
      const entry = input.shifts[`${employeeId}_${dateKey}`];
      return !plannedDays.has(dateKey) && (entry == null || entry.isDelete === true);
    };
    const isEmptied = (dateKey: string) => {
      const day = plannedDays.get(dateKey);
      return (
        day != null &&
        day.assignmentIds.length === 0 &&
        day.absenceTypeId == null &&
        day.restOfDayAbsenceTypeId == null
      );
    };
    const weeks = new Map<string, { writable: string[]; emptied: string[] }>();
    for (const dateKey of input.dateKeys) {
      const writable = isWritable(dateKey);
      if (!writable && !isEmptied(dateKey)) continue;
      const week = getScheduleWeekStartDate(dateKey);
      const days = weeks.get(week) ?? { writable: [], emptied: [] };
      (writable ? days.writable : days.emptied).push(dateKey);
      weeks.set(week, days);
    }
    for (const [week, { writable, emptied }] of weeks) {
      const days = Array.from({ length: 7 }, (_, offset) =>
        formatDateKey(addDays(parseLocalDateKey(week), offset)),
      );
      // Another absence, such as vacation, stands in for a workday.
      const accounted = days.filter((dateKey) => {
        if (worked(dateKey)) return true;
        const absence = absenceOn(dateKey);
        return absence != null && absence !== input.absenceTypeId;
      }).length;
      const short = Math.max(0, MAX_DAYS_IN_A_WEEK - accounted);
      const offCount =
        writable.length + emptied.length - Math.min(short, writable.length + emptied.length);
      // Known days off: the day off absence, or a day already past without work.
      const daysOff = new Set(
        chooseDaysOff(
          writable,
          Math.max(0, writable.length - offCount),
          (dateKey) =>
            absenceOn(dateKey) === input.absenceTypeId ||
            (dateKey < input.todayKey && !worked(dateKey) && absenceOn(dateKey) == null),
        ),
      );
      for (const dateKey of emptied) blanks.push({ employeeId, dateKey });
      for (const dateKey of writable) {
        if (!daysOff.has(dateKey)) {
          blanks.push({ employeeId, dateKey });
          continue;
        }
        writes.push({
          employeeId,
          dateKey,
          input: {
            kind: "absence",
            segments: [],
            absenceTypeId: input.absenceTypeId,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
        });
      }
    }
  }
  return { writes, blanks };
}

/** The engine's input and its words, from the schedule page's own data. */
export function buildCoverageSuggestionInput(input: CoverageSuggestionAdapterInput): {
  engine: CoverageSuggestionInput;
  text: CoverageSuggestionTextLookups;
} {
  const assignmentById = new Map(
    input.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const engine: CoverageSuggestionInput = {
    matrix: input.matrix,
    coverage: input.coverage,
    mentoredCredit: input.mentoredCredit,
    draftDay: (employeeId, dateKey) => draftDayFromShifts(input.shifts, employeeId, dateKey),
    publishedDay: (employeeId, dateKey) =>
      publishedDayFromShifts(input.shifts, employeeId, dateKey),
    dateKeys: input.loadedDateKeys,
    people: input.employees.map((employee) => ({
      id: employee.id,
      name: getEmployeeDisplayName(employee),
      active: employee.status === "active",
      focusAreaIds: employee.focusAreaIds,
    })),
    qualifiedFor: (employeeId, assignmentId) => {
      const employee = employeeById.get(employeeId);
      const assignment = assignmentById.get(assignmentId);
      return (
        employee != null &&
        assignment != null &&
        isEmployeeQualifiedForAssignmentDefinition(employee, {
          assignment,
          shiftCategories: input.shiftCategories,
          jobs: input.jobs,
          orgRoles: input.orgRoles,
        })
      );
    },
    availability: (employeeId, dateKey, assignmentId) =>
      availabilityFromShifts(input, employeeId, dateKey, assignmentId),
    hasRequest: (employeeId, dateKey) => hasOpenRequest(input.requests, employeeId, dateKey),
    pendingPickups: pendingPickupsFromRequests(input.requests),
    workLimit: workLimitWith(input),
  };
  const rowLabels = new Map(
    input.matrix.rows.map((row) => [row.rowKey, `${row.focusAreaName} · ${row.rowLabel}`]),
  );
  const text: CoverageSuggestionTextLookups = {
    personName: (employeeId) => {
      const employee = employeeById.get(employeeId);
      return employee ? getEmployeeDisplayName(employee) : null;
    },
    assignmentName: (assignmentId) =>
      input.assignmentNames.get(assignmentId) ??
      assignmentById.get(assignmentId)?.name ??
      "Unknown shift",
    assignmentFocusAreaId: (assignmentId) => assignmentById.get(assignmentId)?.focusAreaId ?? null,
    focusAreaName: (focusAreaId) => input.focusAreaNames.get(focusAreaId) ?? null,
    absenceName: (absenceTypeId) => input.absenceNames.get(absenceTypeId) ?? "Unknown absence",
    rowLabel: (rowKey) => rowLabels.get(rowKey) ?? null,
    formatDate: (dateKey) => formatShortDate(parseLocalDateKey(dateKey)),
  };
  return { engine, text };
}

export interface SuggestionWrite {
  employeeId: string;
  dateKey: string;
  input: ScheduleCellInput | null;
}

/**
 * What applying a draft suggestion writes, and what Undo writes back. A move
 * back or restore returns each day to its published state; a schedule uses
 * Fill a spot's builder. Null when a schedule can no longer be built.
 */
export function planSuggestionWrites(
  suggestion: CoverageSuggestion,
  shifts: ShiftMap,
  buildAssignInput: (suggestion: CoverageSuggestion) => ScheduleCellInput | null,
): { writes: SuggestionWrite[]; before: SuggestionWrite[] } | null {
  const days = suggestion.overrides.filter((override) => override.side === "draft");
  const writes = days.map((override) => ({
    employeeId: override.employeeId,
    dateKey: override.dateKey,
    input:
      suggestion.kind === "assign"
        ? buildAssignInput(suggestion)
        : scheduleCellSnapshotToInput(
            shifts[`${override.employeeId}_${override.dateKey}`]?.published,
          ),
  }));
  if (suggestion.kind === "assign" && !writes[0]?.input) return null;
  const before = days.map((override) => ({
    employeeId: override.employeeId,
    dateKey: override.dateKey,
    input: scheduleCellSnapshotToInput(
      shifts[`${override.employeeId}_${override.dateKey}`]?.effective,
    ),
  }));
  return { writes, before };
}

function sameCellInput(left: ScheduleCellInput | null, right: ScheduleCellInput | null): boolean {
  if (!left || !right) return left === right;
  return (
    left.kind === right.kind &&
    (left.absenceTypeId ?? null) === (right.absenceTypeId ?? null) &&
    (left.customStartTime ?? null) === (right.customStartTime ?? null) &&
    (left.customEndTime ?? null) === (right.customEndTime ?? null) &&
    left.segments.length === right.segments.length &&
    left.segments.every((segment, index) => {
      const other = right.segments[index];
      return (
        segment.shiftId === other.shiftId &&
        segment.jobId === other.jobId &&
        segment.position === other.position &&
        Boolean(segment.isMentored) === Boolean(other.isMentored)
      );
    })
  );
}

/**
 * What Undo may put back: only the cells that still hold what was written.
 * A cell someone changed since keeps that change, and is counted so Undo can
 * say so. `before[i]` is the cell `writes[i]` replaced.
 */
export function planUndo(
  applied: { before: SuggestionWrite[]; writes: SuggestionWrite[] },
  shifts: ShiftMap,
): { restore: SuggestionWrite[]; kept: number } {
  const restore: SuggestionWrite[] = [];
  let kept = 0;
  applied.writes.forEach((write, index) => {
    const entry = shifts[`${write.employeeId}_${write.dateKey}`];
    const current = entry?.isDelete ? null : scheduleCellSnapshotToInput(entry?.effective);
    if (sameCellInput(current, write.input)) restore.push(applied.before[index]);
    else kept += 1;
  });
  return { restore, kept };
}
