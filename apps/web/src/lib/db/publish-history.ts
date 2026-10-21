import { isNotePublishChangeState, type NotePublishChangeState } from "@dubgrid/contracts";
import type { NotePublishChange, PublishChange, ShiftJobSegment } from "@/types";

export interface ScheduleChangeRow {
  emp_id: string;
  date: string;
  kind: string;
  from_state: unknown;
  to_state: unknown;
  from_absence_type_id: number | null;
  to_absence_type_id: number | null;
  updated_by: string | null;
  from_custom_start: string | null;
  from_custom_end: string | null;
  to_custom_start: string | null;
  to_custom_end: string | null;
}

/**
 * True for a row recording a published note change rather than a cell change.
 *
 * Notes share `schedule_publish_changes` with cells: the publish route writes
 * them there so the change overlay needs no new table, so every reader has to
 * pick the rows it can actually interpret.
 */
export function isNotePublishChangeRow(
  row: Pick<ScheduleChangeRow, "from_state" | "to_state">,
): boolean {
  return isNotePublishChangeState(row.to_state) || isNotePublishChangeState(row.from_state);
}

function segmentIdentityKey(segment: {
  shiftId: number | null;
  jobId: number;
  position: number;
  isMentored?: boolean;
}): string {
  return `${segment.shiftId ?? "null"}:${segment.jobId}:${segment.isMentored ? 1 : 0}`;
}

function stateIdentityKey(state: PublishChange["fromState"]): string {
  if (!state || state.kind === "deleted") return "deleted";
  if (state.kind === "absence") return `absence:${state.absenceTypeId}`;
  const segments = [...state.segments]
    .sort((left, right) => left.position - right.position)
    .map(segmentIdentityKey)
    .join("|");
  // A worked cell's absenceTypeId is its rest-of-day absence (item 45).
  return `worked:${segments}:${state.customStartTime ?? ""}:${state.customEndTime ?? ""}:${state.absenceTypeId ?? ""}`;
}

/**
 * Splits a change row's absence id by the state it belongs to. Since 082 the
 * row also records a worked cell's rest-of-day absence there, so only an
 * absence state makes it a whole-day absence. Rows without state predate both.
 */
function splitAbsenceTypeId(
  state: PublishChange["fromState"],
  absenceTypeId: number | null,
): { wholeDay: number | null; restOfDay: number | null } {
  if (!state) return { wholeDay: absenceTypeId, restOfDay: null };
  if (state.kind === "absence") return { wholeDay: absenceTypeId, restOfDay: null };
  if (state.kind === "worked") return { wholeDay: null, restOfDay: absenceTypeId };
  return { wholeDay: null, restOfDay: null };
}

/**
 * True for a "modified" row whose before and after states are the same
 * schedule: an edit undone before it was published. `publish_schedule` stopped
 * recording these (migration 020), but rows written before that are still in
 * the ledger and would count as an edit and tint a cell nothing changed in.
 */
export function isNoOpPublishChange(
  change: Pick<PublishChange, "kind" | "fromState" | "toState">,
): boolean {
  if (change.kind !== "modified" || !change.fromState || !change.toState) return false;
  return stateIdentityKey(change.fromState) === stateIdentityKey(change.toState);
}

/** Maps schedule_publish_changes rows (from an embedded select on publish_history) to the PublishChange[] shape every consumer already expects. */
export function toPublishChanges(rows: ScheduleChangeRow[] | null | undefined): PublishChange[] {
  return (rows ?? [])
    .filter((row) => !isNotePublishChangeRow(row))
    .filter(
      (row) =>
        !isNoOpPublishChange({
          kind: row.kind as PublishChange["kind"],
          fromState: row.from_state as PublishChange["fromState"],
          toState: row.to_state as PublishChange["toState"],
        }),
    )
    .map((row) => {
      const fromState = row.from_state as PublishChange["fromState"];
      const toState = row.to_state as PublishChange["toState"];
      const fromAbsence = splitAbsenceTypeId(fromState, row.from_absence_type_id);
      const toAbsence = splitAbsenceTypeId(toState, row.to_absence_type_id);
      return {
        empId: row.emp_id,
        date: row.date,
        kind: row.kind as PublishChange["kind"],
        fromState,
        toState,
        fromSegments: fromState?.segments as ShiftJobSegment[] | undefined,
        toSegments: toState?.segments as ShiftJobSegment[] | undefined,
        fromAbsenceTypeId: fromAbsence.wholeDay,
        toAbsenceTypeId: toAbsence.wholeDay,
        fromRestOfDayAbsenceTypeId: fromAbsence.restOfDay,
        toRestOfDayAbsenceTypeId: toAbsence.restOfDay,
        updatedBy: row.updated_by,
        fromCustomStart: row.from_custom_start,
        fromCustomEnd: row.from_custom_end,
        toCustomStart: row.to_custom_start,
        toCustomEnd: row.to_custom_end,
      };
    });
}

/** The note half of the same rows, for the grid's note dots. */
export function toNotePublishChanges(
  rows: ScheduleChangeRow[] | null | undefined,
): NotePublishChange[] {
  const changes: NotePublishChange[] = [];
  for (const row of rows ?? []) {
    if (!isNotePublishChangeRow(row)) continue;
    const state = (
      isNotePublishChangeState(row.to_state) ? row.to_state : row.from_state
    ) as NotePublishChangeState;
    changes.push({
      empId: row.emp_id,
      date: row.date,
      kind: row.kind === "deleted" ? "deleted" : "new",
      indicatorTypeId: state.indicatorTypeId,
      focusAreaId: state.focusAreaId,
      indicatorName: state.indicatorName,
      indicatorColor: state.indicatorColor,
      updatedBy: row.updated_by,
    });
  }
  return changes;
}
