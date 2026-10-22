import {
  buildShiftJobPairKey,
  cellStateToChangeDay,
  describeShiftChange,
  formatShiftChangeHours,
  selectOriginalCellChange,
  UNKNOWN_JOB_NAME,
  UNKNOWN_SHIFT_NAME,
  type ShiftChange,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";
import { isDefaultShiftSystemJob } from "@/lib/system-jobs";
import type {
  AbsenceType,
  AssignmentDefinition,
  FocusArea,
  JobDefinition,
  PublishChange,
  ScheduleCellState,
  ShiftCategory,
} from "@/types";

export interface ShiftChangeOrgData {
  /** Every definition, archived ones included, so history can still name them. */
  assignments: readonly AssignmentDefinition[];
  shiftCategories: readonly ShiftCategory[];
  jobs: readonly JobDefinition[];
  absenceTypes: readonly AbsenceType[];
  focusAreas: readonly FocusArea[];
}

function byId<T extends { id: number }>(items: readonly T[]): Map<number, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/** An active definition wins over an archived one for the same shift and job. */
function assignmentsByPair(
  assignments: readonly AssignmentDefinition[],
): Map<string, AssignmentDefinition> {
  const map = new Map<string, AssignmentDefinition>();
  for (const assignment of assignments) {
    if (assignment.jobId == null) continue;
    const key = buildShiftJobPairKey(
      assignment.shiftId ?? assignment.categoryId ?? null,
      assignment.jobId,
    );
    const existing = map.get(key);
    if (!existing || (existing.archivedAt && !assignment.archivedAt)) map.set(key, assignment);
  }
  return map;
}

export function buildShiftChangeResolvers(data: ShiftChangeOrgData): ShiftChangeResolvers {
  const shiftById = byId(data.shiftCategories);
  const jobById = byId(data.jobs);
  const absenceById = byId(data.absenceTypes);
  const focusAreaById = byId(data.focusAreas);
  const assignmentByPair = assignmentsByPair(data.assignments);

  return {
    segment(shiftId, jobId) {
      const shift = shiftId != null ? (shiftById.get(shiftId) ?? null) : null;
      const job = jobById.get(jobId) ?? null;
      const assignment = assignmentByPair.get(buildShiftJobPairKey(shiftId, jobId)) ?? null;
      if (!shift && !job && !assignment) return null;
      const defaults = {
        defaultStart:
          assignment?.defaultStartTime ?? shift?.startTime ?? job?.defaultStartTime ?? null,
        defaultEnd: assignment?.defaultEndTime ?? shift?.endTime ?? job?.defaultEndTime ?? null,
        breakMinutes: shift?.breakMinutes ?? null,
        focusAreaId: assignment?.focusAreaId ?? shift?.focusAreaId ?? null,
      };
      if (shiftId == null || assignment?.isGeneral === true) {
        return {
          ...defaults,
          shiftName: null,
          jobName: job?.name ?? assignment?.name ?? assignment?.label ?? UNKNOWN_JOB_NAME,
          jobArchived: Boolean(job?.archivedAt ?? assignment?.archivedAt),
        };
      }
      // The shift's own name and the job's, so one shift reads the same in
      // every focus area whatever its options are called. Without a known job,
      // the option's name stands alone.
      const archived = Boolean(assignment?.archivedAt ?? shift?.archivedAt);
      const shiftName = shift?.name || assignment?.name || assignment?.label || UNKNOWN_SHIFT_NAME;
      if (!job) {
        return {
          ...defaults,
          shiftName: null,
          jobName: assignment?.name || shiftName,
          jobArchived: archived,
        };
      }
      if (
        isDefaultShiftSystemJob(job) ||
        shiftName.toLocaleLowerCase().includes(job.name.toLocaleLowerCase())
      ) {
        return { ...defaults, shiftName: null, jobName: shiftName, jobArchived: archived };
      }
      return {
        ...defaults,
        shiftName,
        jobName: job.name,
        shiftArchived: archived,
        jobArchived: Boolean(job.archivedAt),
      };
    },
    absenceType(absenceTypeId) {
      const absence = absenceById.get(absenceTypeId);
      return absence
        ? { name: absence.name || absence.label, archived: Boolean(absence.archivedAt) }
        : null;
    },
    focusArea(focusAreaId) {
      return focusAreaById.get(focusAreaId)?.name ?? null;
    },
  };
}

export function describeCellStateChange(
  before: ScheduleCellState | null | undefined,
  after: ScheduleCellState | null | undefined,
  date: string,
  resolvers: ShiftChangeResolvers,
): ShiftChange {
  return describeShiftChange(
    cellStateToChangeDay(before, resolvers),
    cellStateToChangeDay(after, resolvers),
    { date },
  );
}

function isEmptyState(state: ScheduleCellState | null | undefined): boolean {
  return !state || state.kind === "deleted";
}

/**
 * Folds one cell's in-window publish changes (oldest first) into the change
 * staff should see: the earliest "from" against the newest "to", since they
 * are assumed to have seen nothing in between. Null when the cell ended where
 * it started. Changes without stored states fall back to the newest.
 */
export function mergeCellPublishChanges<T extends PublishChange>(changes: readonly T[]): T | null {
  if (changes.length === 0) return null;
  const first = changes[0];
  const last = changes[changes.length - 1];
  if (changes.length === 1) return first;
  const statesMissing =
    (first.kind !== "new" && !first.fromState) || (last.kind !== "deleted" && !last.toState);
  if (statesMissing) return last;

  const original = selectOriginalCellChange(
    changes.map((change) => ({
      fromState: change.fromState ?? null,
      toState: change.toState ?? null,
    })),
  );
  if (!original) return null;

  const kind: PublishChange["kind"] = isEmptyState(first.fromState)
    ? "new"
    : isEmptyState(last.toState)
      ? "deleted"
      : "modified";
  return {
    ...last,
    kind,
    isNewAddition: first.isNewAddition,
    from: first.from,
    fromState: first.fromState,
    fromSegments: first.fromSegments,
    fromAbsenceTypeId: first.fromAbsenceTypeId,
    fromRestOfDayAbsenceTypeId: first.fromRestOfDayAbsenceTypeId,
    fromCustomStart: first.fromCustomStart,
    fromCustomEnd: first.fromCustomEnd,
  };
}

export interface CellStateParts {
  segments: ReadonlyArray<{
    shiftId: number | null;
    jobId: number;
    position?: number;
    isMentored?: boolean;
  }>;
  /** A whole-day absence. */
  absenceTypeId: number | null;
  restOfDayAbsenceTypeId: number | null;
  customTimes: { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
}

/** Rebuilds a stored cell from the grid's per-cell values. */
export function cellStateFromParts(parts: CellStateParts): ScheduleCellState {
  const base = { seriesId: null, fromRecurring: false } as const;
  if (parts.absenceTypeId != null) {
    return {
      ...base,
      kind: "absence",
      segments: [],
      absenceTypeId: parts.absenceTypeId,
      customStartTime: null,
      customEndTime: null,
    };
  }
  if (parts.segments.length === 0) {
    return {
      ...base,
      kind: "deleted",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
    };
  }
  const perPill = parts.customTimes?.perPill;
  return {
    ...base,
    kind: "worked",
    segments: parts.segments.map((segment, index) => ({
      shiftId: segment.shiftId,
      jobId: segment.jobId,
      position: segment.position ?? index,
      isMentored: segment.isMentored ?? false,
    })),
    absenceTypeId: parts.restOfDayAbsenceTypeId,
    customStartTime: perPill
      ? perPill.map((pill) => pill.start).join("|")
      : (parts.customTimes?.start ?? null),
    customEndTime: perPill
      ? perPill.map((pill) => pill.end).join("|")
      : (parts.customTimes?.end ?? null),
  };
}

/** True when a publish change carries the stored states the model reads. */
export function publishChangeHasStates(change: PublishChange): boolean {
  return (
    (change.kind === "new" || !!change.fromState) && (change.kind === "deleted" || !!change.toState)
  );
}

const LABEL_TEXT = { shift1: "Shift 1", shift2: "Shift 2", absence: "Absence" } as const;

/**
 * Plain text for a chip tooltip beside the current shift: the old side only,
 * as "Was ...". Null when nothing changed.
 */
export function formatShiftChangeWasText(change: ShiftChange): string | null {
  if (change.kind === "none") return null;
  const before = change.before.items;
  if (change.kind === "single") {
    if (before.length === 0) {
      const added = change.after.items[0];
      return added ? `Added: ${added.plain}` : null;
    }
    const [item] = before;
    return change.after.items.length === 0 ? `Removed: ${item.plain}` : `Was ${item.plain}`;
  }
  if (before.length === 0) return "Was no shift";
  const total =
    change.before.totalMinutes != null
      ? ` (${formatShiftChangeHours(change.before.totalMinutes)})`
      : "";
  const lines = before.map((item) => {
    const label = item.label ? `${LABEL_TEXT[item.label]}: ` : "";
    const suffix = item.status === "removed" ? " (removed)" : "";
    return `${label}${item.plain}${suffix}`;
  });
  return [`Was${total}:`, ...lines].join("\n");
}
