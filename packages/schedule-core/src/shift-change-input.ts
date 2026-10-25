import type { ScheduleCellState } from "@dubgrid/contracts";
import { buildShiftJobPairKey } from "./hours-assembly";
import { normalizeTimeValue } from "./schedule-time";
import type { ShiftChangeDayInput, ShiftChangeItemInput } from "./shift-change";

export interface ShiftChangeSegmentDefinition {
  /** Null shows the job alone, e.g. a shift-only job whose name is the shift's. */
  shiftName: string | null;
  jobName: string;
  shiftArchived?: boolean;
  jobArchived?: boolean;
  /** The definition's home focus area. */
  focusAreaId: number | null;
  defaultStart: string | null;
  defaultEnd: string | null;
  breakMinutes?: number | null;
}

/** Name lookups, including archived definitions, so history can still name them. */
export interface ShiftChangeResolvers {
  segment(shiftId: number | null, jobId: number): ShiftChangeSegmentDefinition | null;
  absenceType(absenceTypeId: number): { name: string; archived?: boolean } | null;
  focusArea(focusAreaId: number): string | null;
}

export const UNKNOWN_SHIFT_NAME = "Unknown shift";
export const UNKNOWN_JOB_NAME = "Unknown job";
export const UNKNOWN_ABSENCE_NAME = "Unknown absence";

/**
 * Splits "07:00|15:00" per segment, keeping empty parts in place ("|12:00"
 * leaves the first empty). A part that is not a time reads as empty.
 */
export function splitSegmentTimes(value: string | null | undefined): Array<string | null> {
  if (!value) return [];
  return value.split("|").map((part) => {
    const time = normalizeTimeValue(part);
    return time && /^\d{2}:\d{2}$/.test(time) ? time : null;
  });
}

function absenceItem(
  absenceTypeId: number,
  scope: "allDay" | "restOfDay",
  resolvers: ShiftChangeResolvers,
  times: { start: string | null; end: string | null } = { start: null, end: null },
): ShiftChangeItemInput {
  const absence = resolvers.absenceType(absenceTypeId);
  return {
    kind: "absence",
    key: `absence:${absenceTypeId}`,
    name: absence?.name ?? UNKNOWN_ABSENCE_NAME,
    archived: absence?.archived,
    scope,
    ...(times.start && times.end ? { start: times.start, end: times.end } : {}),
  };
}

/**
 * Builds one side of a change from a stored cell. A shiftless job has no focus
 * area; otherwise the definition's home focus area wins over the cell's, the
 * same rule mobile uses for `displayFocusAreaName`.
 */
export function cellStateToChangeDay(
  state: ScheduleCellState | null | undefined,
  resolvers: ShiftChangeResolvers,
): ShiftChangeDayInput {
  if (!state || state.kind === "deleted") return { items: [] };
  if (state.kind === "absence") {
    return {
      items:
        state.absenceTypeId == null ? [] : [absenceItem(state.absenceTypeId, "allDay", resolvers)],
    };
  }

  const starts = splitSegmentTimes(state.customStartTime);
  const ends = splitSegmentTimes(state.customEndTime);
  const segments = [...state.segments].sort((left, right) => left.position - right.position);
  const items: ShiftChangeItemInput[] = segments.map((segment, index) => {
    const definition = resolvers.segment(segment.shiftId, segment.jobId);
    const focusAreaId =
      segment.shiftId == null ? null : (definition?.focusAreaId ?? state.focusAreaId ?? null);
    return {
      kind: "shift",
      key: buildShiftJobPairKey(segment.shiftId, segment.jobId),
      shiftName:
        segment.shiftId == null ? null : definition ? definition.shiftName : UNKNOWN_SHIFT_NAME,
      jobName: definition?.jobName ?? UNKNOWN_JOB_NAME,
      shiftArchived: definition?.shiftArchived,
      jobArchived: definition?.jobArchived,
      focusAreaName: focusAreaId == null ? null : resolvers.focusArea(focusAreaId),
      start: starts[index] ?? definition?.defaultStart ?? null,
      end: ends[index] ?? definition?.defaultEnd ?? null,
      breakMinutes: definition?.breakMinutes ?? null,
    };
  });
  if (state.absenceTypeId != null)
    items.push(
      absenceItem(state.absenceTypeId, "restOfDay", resolvers, {
        start: normalizeTimeValue(state.absenceStartTime ?? null),
        end: normalizeTimeValue(state.absenceEndTime ?? null),
      }),
    );
  return { items };
}

function isEmptyCell(state: ScheduleCellState | null | undefined): boolean {
  return !state || state.kind === "deleted";
}

function timesKey(value: string | null | undefined): string {
  const parts = splitSegmentTimes(value);
  return parts.every((part) => part == null) ? "" : parts.map((part) => part ?? "").join("|");
}

function segmentsKey(state: ScheduleCellState): string {
  return [...state.segments]
    .sort((left, right) => left.position - right.position)
    .map((segment) => buildShiftJobPairKey(segment.shiftId, segment.jobId))
    .join(",");
}

/**
 * True when two stored cells read the same. Mentoring is left out: no change
 * surface shows it, so a mentoring-only edit would look like no change.
 */
export function isSameCellState(
  left: ScheduleCellState | null | undefined,
  right: ScheduleCellState | null | undefined,
): boolean {
  if (isEmptyCell(left) || isEmptyCell(right)) return isEmptyCell(left) && isEmptyCell(right);
  const a = left as ScheduleCellState;
  const b = right as ScheduleCellState;
  return (
    a.kind === b.kind &&
    segmentsKey(a) === segmentsKey(b) &&
    (a.absenceTypeId ?? null) === (b.absenceTypeId ?? null) &&
    timesKey(a.customStartTime) === timesKey(b.customStartTime) &&
    timesKey(a.customEndTime) === timesKey(b.customEndTime) &&
    timesKey(a.absenceStartTime) === timesKey(b.absenceStartTime) &&
    timesKey(a.absenceEndTime) === timesKey(b.absenceEndTime) &&
    (a.focusAreaId ?? null) === (b.focusAreaId ?? null)
  );
}

export interface CellStateChange {
  fromState: ScheduleCellState | null;
  toState: ScheduleCellState | null;
}

/**
 * Staff are assumed to have seen none of the versions in between: given one
 * cell's publish changes oldest first, compare the earliest "from" with the
 * latest "to". Null when they read the same.
 */
export function selectOriginalCellChange(
  changes: ReadonlyArray<CellStateChange>,
): CellStateChange | null {
  if (changes.length === 0) return null;
  const fromState = changes[0].fromState ?? null;
  const toState = changes[changes.length - 1].toState ?? null;
  if (isSameCellState(fromState, toState)) return null;
  return { fromState, toState };
}
