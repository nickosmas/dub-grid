import type {
  JobDefinition,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
  ShiftJobSegment,
} from "@/types";
import { buildShiftDisplayParts, getShiftAbbr } from "@/lib/assignable-shifts";
import { resolveJobTimesForShift, shouldShowJobOnGrid } from "@/lib/job-placement";

type AssignmentDefinitionPairCompatible = {
  id: number;
  shiftId?: number | null;
  categoryId?: number | null;
  jobId?: number | null;
  archivedAt?: string | null;
  shift_id?: number | null;
  category_id?: number | null;
  job_id?: number | null;
  archived_at?: string | null;
};

export type SegmentCompatibilityMaps = {
  shiftById: Map<number, ShiftCategory>;
  jobById: Map<number, JobDefinition>;
  assignmentById: Map<number, AssignmentDefinition>;
  assignmentByPair: Map<string, AssignmentDefinition>;
  shiftDisplayMode: ShiftDisplayMode;
};

type ResolveStoredSegmentsInput = {
  shiftIds?: Array<number | null> | null;
  jobIds?: number[] | null;
  assignmentIds?: number[] | null;
};

export function buildShiftJobPairKey(shiftId: number | null, jobId: number): string {
  return `${shiftId ?? "null"}:${jobId}`;
}

export function createAssignmentDefinitionIdByPairMap<T extends AssignmentDefinitionPairCompatible>(
  assignments: T[],
): Map<string, number> {
  const assignmentIdByPair = new Map<string, number>();

  for (const assignment of assignments) {
    if ((assignment.archivedAt ?? assignment.archived_at) != null) continue;
    const shiftId =
      assignment.shiftId ??
      assignment.shift_id ??
      assignment.categoryId ??
      assignment.category_id ??
      null;
    const jobId = assignment.jobId ?? assignment.job_id ?? null;
    if (jobId == null) continue;
    const key = buildShiftJobPairKey(shiftId, jobId);
    if (!assignmentIdByPair.has(key) || assignment.shiftId != null || assignment.shift_id != null) {
      assignmentIdByPair.set(key, assignment.id);
    }
  }

  return assignmentIdByPair;
}

export function deriveAssignmentDefinitionIdsFromAssignments(
  input: {
    shiftIds?: Array<number | null> | null;
    jobIds?: number[] | null;
  },
  assignmentIdByPair: Map<string, number>,
): number[] {
  const shiftIds = input.shiftIds ?? [];
  const jobIds = input.jobIds ?? [];
  const count = Math.max(shiftIds.length, jobIds.length);
  const assignmentIds: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const jobId = jobIds[index];
    if (jobId == null) continue;
    const assignmentId = assignmentIdByPair.get(
      buildShiftJobPairKey(shiftIds[index] ?? null, jobId),
    );
    if (assignmentId != null) {
      assignmentIds.push(assignmentId);
    }
  }

  return assignmentIds;
}

function buildSegmentLabel(
  shift: ShiftCategory | null,
  job: JobDefinition | null,
  assignment: AssignmentDefinition | null,
  shiftDisplayMode: ShiftDisplayMode,
): string {
  if (assignment) {
    const displayParts = buildShiftDisplayParts({
      shift,
      job,
      assignment,
      shiftDisplayMode,
    });
    return displayParts.secondaryLabel
      ? `${displayParts.primaryLabel} · ${displayParts.secondaryLabel}`
      : displayParts.primaryLabel;
  }

  if (!shift) {
    return shiftDisplayMode === "name" ? (job?.name ?? "?") : (job?.abbr ?? "?");
  }

  const primary = shiftDisplayMode === "name" ? shift.name : (getShiftAbbr(shift) ?? shift.name);

  if (!job || !shouldShowJobOnGrid(job)) {
    return primary;
  }

  const secondary = shiftDisplayMode === "name" ? job.name : job.abbr;

  return `${primary} · ${secondary}`;
}

/**
 * Pair-keyed assignment lookup, for surfaces that need an assignment's color or
 * name from a stored shift/job pair without the rest of the compatibility maps.
 */
export function createAssignmentDefinitionByPairMap(
  assignments: AssignmentDefinition[],
): Map<string, AssignmentDefinition> {
  const assignmentByPair = new Map<string, AssignmentDefinition>();

  for (const assignment of assignments) {
    if (assignment.archivedAt) continue;
    const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
    const jobId = assignment.jobId ?? null;
    if (jobId == null) continue;
    assignmentByPair.set(buildShiftJobPairKey(shiftId, jobId), assignment);
  }

  return assignmentByPair;
}

export function createShiftJobCompatibilityMaps(input: {
  assignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  shiftDisplayMode?: ShiftDisplayMode;
}): SegmentCompatibilityMaps {
  const assignments = input.assignments ?? [];
  const shiftById = new Map(input.shiftCategories.map((shift) => [shift.id, shift]));
  const jobById = new Map(input.jobs.map((job) => [job.id, job]));
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));

  return {
    shiftById,
    jobById,
    assignmentById,
    assignmentByPair: createAssignmentDefinitionByPairMap(assignments),
    shiftDisplayMode: input.shiftDisplayMode ?? "code",
  };
}

export function resolveShiftJobSegments(
  input: ResolveStoredSegmentsInput,
  maps: SegmentCompatibilityMaps,
): ShiftJobSegment[] {
  const explicitShiftIds = input.shiftIds ?? [];
  const explicitJobIds = input.jobIds ?? [];
  const explicitAssignmentDefinitionIds = input.assignmentIds ?? [];
  const count = Math.max(
    explicitShiftIds.length,
    explicitJobIds.length,
    explicitAssignmentDefinitionIds.length,
  );

  const segments: ShiftJobSegment[] = [];

  for (let index = 0; index < count; index += 1) {
    const explicitAssignmentDefinitionId = explicitAssignmentDefinitionIds[index] ?? null;
    const explicitAssignmentDefinition =
      explicitAssignmentDefinitionId != null
        ? (maps.assignmentById.get(explicitAssignmentDefinitionId) ?? null)
        : null;

    const shiftId =
      explicitShiftIds[index] ??
      explicitAssignmentDefinition?.shiftId ??
      explicitAssignmentDefinition?.categoryId ??
      null;
    const jobId = explicitJobIds[index] ?? explicitAssignmentDefinition?.jobId ?? null;

    if (jobId == null) {
      continue;
    }

    const shift = shiftId != null ? (maps.shiftById.get(shiftId) ?? null) : null;
    const job = maps.jobById.get(jobId) ?? null;
    const assignment =
      explicitAssignmentDefinition ??
      maps.assignmentByPair.get(buildShiftJobPairKey(shiftId, jobId)) ??
      null;
    const resolvedJobTimes = resolveJobTimesForShift(job, shift);

    segments.push({
      shiftId,
      jobId,
      position: index,
      assignmentId: assignment?.id ?? null,
      label: assignment?.label ?? buildSegmentLabel(shift, job, assignment, maps.shiftDisplayMode),
      shiftName: shift?.name ?? null,
      shiftAbbr: getShiftAbbr(shift),
      jobName: job?.name ?? null,
      jobAbbr: job?.abbr ?? null,
      focusAreaId: shift?.focusAreaId ?? assignment?.focusAreaId ?? null,
      showJobOnGrid: shouldShowJobOnGrid(job),
      isShiftless: shift == null,
      isShiftOnly:
        assignment != null
          ? buildShiftDisplayParts({
              shift,
              job,
              assignment,
              shiftDisplayMode: maps.shiftDisplayMode,
            }).isShiftOnly
          : false,
      isMentored: false,
      startTime: assignment?.defaultStartTime ?? resolvedJobTimes.startTime,
      endTime: assignment?.defaultEndTime ?? resolvedJobTimes.endTime,
    });
  }

  return segments;
}

export function deriveAssignmentDefinitionIdsFromSegments(
  segments: ShiftJobSegment[],
  maps: SegmentCompatibilityMaps,
): number[] {
  return segments
    .map((segment) => {
      if (segment.assignmentId != null) {
        return segment.assignmentId;
      }
      const assignment = maps.assignmentByPair.get(
        buildShiftJobPairKey(segment.shiftId ?? null, segment.jobId),
      );
      return assignment?.id ?? null;
    })
    .filter((assignmentId): assignmentId is number => assignmentId != null);
}

export function joinShiftJobSegmentLabels(segments: ShiftJobSegment[]): string {
  return segments.map((segment) => segment.label || "?").join("/");
}

/**
 * Full-name sibling of {@link joinShiftJobSegmentLabels}. Spells out shift and
 * job names for roomy surfaces (request board, dashboard cards, staff detail)
 * instead of the space-constrained grid abbreviations.
 *
 * Returns "" when nothing in the segments is nameable, so a caller can fall
 * back to the abbreviated label. It never emits a placeholder of its own: a
 * bare "?" reads to the user as a broken shift rather than an unresolved one.
 */
export function joinShiftJobSegmentNames(segments: ShiftJobSegment[]): string {
  return segments
    .map((segment) => {
      const shiftName = segment.shiftName?.trim() ?? "";
      const jobName = segment.jobName?.trim() ?? "";
      if (!shiftName) return jobName || segment.label || ""; // shiftless
      if (segment.isShiftOnly || segment.showJobOnGrid === false || !jobName) {
        return shiftName; // shift-only
      }
      return `${shiftName} · ${jobName}`;
    })
    .filter(Boolean)
    .join("/");
}
