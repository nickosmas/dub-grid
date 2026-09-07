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

/** Maps schedule_publish_changes rows (from an embedded select on publish_history) to the PublishChange[] shape every consumer already expects. */
export function toPublishChanges(rows: ScheduleChangeRow[] | null | undefined): PublishChange[] {
  return (rows ?? [])
    .filter((row) => !isNotePublishChangeRow(row))
    .map((row) => {
      const fromState = row.from_state as PublishChange["fromState"];
      const toState = row.to_state as PublishChange["toState"];
      return {
        empId: row.emp_id,
        date: row.date,
        kind: row.kind as PublishChange["kind"],
        fromState,
        toState,
        fromSegments: fromState?.segments as ShiftJobSegment[] | undefined,
        toSegments: toState?.segments as ShiftJobSegment[] | undefined,
        fromAbsenceTypeId: row.from_absence_type_id,
        toAbsenceTypeId: row.to_absence_type_id,
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
