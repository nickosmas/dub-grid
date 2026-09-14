import type {
  AssignmentDefinition,
  GridOpenShift,
  JobDefinition,
  NamedItem,
  ScheduleCellInput,
  ScheduleCellSegmentInput,
  ScheduleCellStateEntry,
  ShiftCategory,
} from "@/types";
import type { Employee } from "@dubgrid/domain";
import { isEmployeeQualifiedForAssignmentDefinition } from "@/lib/assignable-shifts";
import { timesOverlap, type TimeRange } from "@/lib/schedule-logic";

export interface StaffingScheduleState {
  kind: ScheduleCellInput["kind"];
  segments: ScheduleCellSegmentInput[];
  assignmentIds: number[];
  absenceTypeId: number | null;
  customStartTime: string | null;
  customEndTime: string | null;
  seriesId?: string | null;
  fromRecurring?: boolean;
}

export interface OpenShiftStaffingOption {
  assignmentIds: number[];
  alignedTimeRanges: Array<TimeRange | null>;
  timeRanges: TimeRange[];
}

export interface OpenShiftStaffingCandidate {
  employee: Employee;
  options: OpenShiftStaffingOption[];
  existingState: StaffingScheduleState | null;
}

interface StaffingContext {
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  orgRoles?: NamedItem[];
}

interface BuildCandidatesInput extends StaffingContext {
  openShift: GridOpenShift;
  employees: Employee[];
  scheduleByEmployeeId: ReadonlyMap<string, StaffingScheduleState | null>;
  sortBy?: "seniority" | "name";
}

interface BuildStaffedInput extends StaffingContext {
  existingState: StaffingScheduleState | null;
  option: OpenShiftStaffingOption;
}

export type OpenShiftClickAction = "staff" | "volunteer" | "details" | "none";

export function resolveOpenShiftClickAction(input: {
  canEditShifts: boolean;
  canSeeAllOpenShifts: boolean;
  canVolunteer: boolean;
  viewerEligible: boolean | undefined;
}): OpenShiftClickAction {
  if (input.canEditShifts) return "staff";
  if (input.viewerEligible === false) {
    return input.canSeeAllOpenShifts ? "details" : "none";
  }
  return input.canVolunteer ? "volunteer" : "none";
}

function splitAlignedTimes(value: string | null | undefined, count: number): Array<string | null> {
  const parts = value?.split("|") ?? [];
  return Array.from({ length: count }, (_, index) => parts[index] || null);
}

function joinAlignedTimes(values: Array<string | null>): string | null {
  return values.some(Boolean) ? values.map((value) => value ?? "").join("|") : null;
}

function assignmentTimeRange(
  assignment: AssignmentDefinition,
  shiftCategories: ShiftCategory[],
): TimeRange | null {
  if (assignment.defaultStartTime && assignment.defaultEndTime) {
    return { start: assignment.defaultStartTime, end: assignment.defaultEndTime };
  }
  const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
  const shift =
    shiftId == null ? null : shiftCategories.find((candidate) => candidate.id === shiftId);
  return shift?.startTime && shift.endTime ? { start: shift.startTime, end: shift.endTime } : null;
}

export function getStaffingStateTimeRanges(
  state: StaffingScheduleState | null,
  context: Pick<StaffingContext, "assignments" | "shiftCategories">,
): TimeRange[] {
  if (!state || state.kind !== "worked") return [];
  const startTimes = splitAlignedTimes(state.customStartTime, state.segments.length);
  const endTimes = splitAlignedTimes(state.customEndTime, state.segments.length);
  const assignmentById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );

  return state.assignmentIds.flatMap((assignmentId, index) => {
    const customStart = startTimes[index];
    const customEnd = endTimes[index];
    if (customStart && customEnd) return [{ start: customStart, end: customEnd }];
    const assignment = assignmentById.get(assignmentId);
    const range = assignment ? assignmentTimeRange(assignment, context.shiftCategories) : null;
    return range ? [range] : [];
  });
}

function buildOptions(
  openShift: GridOpenShift,
  context: StaffingContext,
): OpenShiftStaffingOption[] {
  const assignmentById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const optionIds =
    openShift.source === "coverage_gap"
      ? (openShift.eligibleAssignmentDefinitionIds?.length
          ? openShift.eligibleAssignmentDefinitionIds
          : openShift.assignmentIds
        ).map((assignmentId) => [assignmentId])
      : [openShift.assignmentIds];

  return optionIds.flatMap((assignmentIds) => {
    const resolved = assignmentIds.map((id) => assignmentById.get(id));
    if (resolved.some((assignment) => !assignment)) return [];

    const customStarts = splitAlignedTimes(
      openShift.source === "calloff" ? openShift.customStartTime : null,
      assignmentIds.length,
    );
    const customEnds = splitAlignedTimes(
      openShift.source === "calloff" ? openShift.customEndTime : null,
      assignmentIds.length,
    );
    const alignedTimeRanges = resolved.map((assignment, index) => {
      if (customStarts[index] && customEnds[index]) {
        return { start: customStarts[index]!, end: customEnds[index]! };
      }
      return assignmentTimeRange(assignment!, context.shiftCategories);
    });
    return [
      {
        assignmentIds,
        alignedTimeRanges,
        timeRanges: alignedTimeRanges.filter((range): range is TimeRange => range != null),
      },
    ];
  });
}

export function buildOpenShiftStaffingCandidates({
  openShift,
  employees,
  scheduleByEmployeeId,
  sortBy = "seniority",
  ...context
}: BuildCandidatesInput): OpenShiftStaffingCandidate[] {
  const assignmentById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const options = buildOptions(openShift, context);

  return employees
    .flatMap((employee): OpenShiftStaffingCandidate[] => {
      if (employee.status !== "active" || !employee.focusAreaIds.includes(openShift.focusAreaId)) {
        return [];
      }
      const existingState = scheduleByEmployeeId.get(employee.id) ?? null;
      if (existingState?.kind === "absence" || existingState?.absenceTypeId != null) return [];
      const existingRanges = getStaffingStateTimeRanges(existingState, context);
      const qualifiedOptions = options.filter(
        (option) =>
          option.assignmentIds.every((assignmentId) => {
            const assignment = assignmentById.get(assignmentId);
            return (
              assignment != null &&
              isEmployeeQualifiedForAssignmentDefinition(employee, {
                assignment,
                shiftCategories: context.shiftCategories,
                jobs: context.jobs,
                orgRoles: context.orgRoles,
              })
            );
          }) && !timesOverlap(existingRanges, option.timeRanges),
      );
      return qualifiedOptions.length > 0
        ? [{ employee, options: qualifiedOptions, existingState }]
        : [];
    })
    .sort((left, right) => {
      if (sortBy === "seniority" && left.employee.seniority !== right.employee.seniority) {
        return left.employee.seniority - right.employee.seniority;
      }
      return `${left.employee.firstName} ${left.employee.lastName}`.localeCompare(
        `${right.employee.firstName} ${right.employee.lastName}`,
      );
    });
}

export function buildStaffedOpenShiftInput({
  existingState,
  option,
  assignments,
}: BuildStaffedInput): ScheduleCellInput | null {
  if (existingState?.kind === "absence" || existingState?.absenceTypeId != null) return null;
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const addedSegments = option.assignmentIds.flatMap((assignmentId, index) => {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment || assignment.jobId == null) return [];
    return [
      {
        shiftId: assignment.shiftId ?? assignment.categoryId ?? null,
        jobId: assignment.jobId,
        position: (existingState?.segments.length ?? 0) + index,
        isMentored: false,
      },
    ];
  });
  if (addedSegments.length !== option.assignmentIds.length) return null;

  const existingSegments = existingState?.kind === "worked" ? existingState.segments : [];
  const existingStarts = splitAlignedTimes(existingState?.customStartTime, existingSegments.length);
  const existingEnds = splitAlignedTimes(existingState?.customEndTime, existingSegments.length);
  const addedStarts = option.alignedTimeRanges.map((range) => range?.start ?? null);
  const addedEnds = option.alignedTimeRanges.map((range) => range?.end ?? null);

  return {
    kind: "worked",
    segments: [...existingSegments, ...addedSegments].map((segment, position) => ({
      shiftId: segment.shiftId ?? null,
      jobId: segment.jobId,
      position,
      isMentored: segment.isMentored ?? false,
    })),
    absenceTypeId: null,
    customStartTime: joinAlignedTimes([...existingStarts, ...addedStarts]),
    customEndTime: joinAlignedTimes([...existingEnds, ...addedEnds]),
    seriesId: existingState?.seriesId ?? null,
    fromRecurring: existingState?.fromRecurring ?? false,
  };
}

function subtractAssignmentIds(currentIds: number[], publishedIds: number[]): number[] {
  const remainingPublished = [...publishedIds];
  return currentIds.filter((assignmentId) => {
    const publishedIndex = remainingPublished.indexOf(assignmentId);
    if (publishedIndex < 0) return true;
    remainingPublished.splice(publishedIndex, 1);
    return false;
  });
}

function containsAssignmentIds(candidateIds: number[], requiredIds: number[]): boolean {
  const remaining = [...candidateIds];
  return requiredIds.every((assignmentId) => {
    const index = remaining.indexOf(assignmentId);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function isCalloffOpenShiftStaffedByDraft(input: {
  openShift: GridOpenShift;
  employees: Employee[];
  shifts: Readonly<Record<string, ScheduleCellStateEntry>>;
}): boolean {
  if (input.openShift.source !== "calloff" || input.openShift.assignmentIds.length === 0) {
    return false;
  }
  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const dateSuffix = `_${input.openShift.date}`;

  return Object.entries(input.shifts).some(([key, entry]) => {
    if (!key.endsWith(dateSuffix) || !entry.draftKind || entry.effective?.kind !== "worked") {
      return false;
    }
    const employeeId = key.slice(0, -dateSuffix.length);
    const employee = employeeById.get(employeeId);
    if (!employee?.focusAreaIds.includes(input.openShift.focusAreaId)) return false;
    const addedIds = subtractAssignmentIds(
      entry.effective.assignmentIds,
      entry.publishedAssignmentDefinitionIds,
    );
    return containsAssignmentIds(addedIds, input.openShift.assignmentIds);
  });
}
