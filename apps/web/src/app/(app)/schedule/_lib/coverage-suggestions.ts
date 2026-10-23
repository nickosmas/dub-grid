import {
  parseLocalDateKey,
  type CoverageAvailability,
  type CoverageDayOverride,
  type CoverageMatrix,
  type CoverageMeasureInput,
  type CoveragePickupRequest,
  type CoverageSuggestion,
  type CoverageSuggestionDay,
  type CoverageSuggestionInput,
  type CoverageSuggestionTextLookups,
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

/**
 * Whether a person can take an assignment that day, by the Fill a spot
 * dialog's own rules, plus not on an absence: a suggestion never overrides
 * time off.
 */
export function availabilityFromShifts(
  input: Pick<
    CoverageSuggestionAdapterInput,
    "shifts" | "assignments" | "shiftCategories" | "loadedDateKeys"
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
    "shifts" | "assignments" | "shiftCategories" | "loadedDateKeys"
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
    return base;
  };
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
