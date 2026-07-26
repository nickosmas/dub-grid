import type { PublishChange } from "@/types";

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

/** Maps schedule_publish_changes rows (from an embedded select on publish_history) to the PublishChange[] shape every consumer already expects. */
export function toPublishChanges(rows: ScheduleChangeRow[] | null | undefined): PublishChange[] {
  return (rows ?? []).map((row) => ({
    empId: row.emp_id,
    date: row.date,
    kind: row.kind as PublishChange["kind"],
    fromState: row.from_state as PublishChange["fromState"],
    toState: row.to_state as PublishChange["toState"],
    fromAbsenceTypeId: row.from_absence_type_id,
    toAbsenceTypeId: row.to_absence_type_id,
    updatedBy: row.updated_by,
    fromCustomStart: row.from_custom_start,
    fromCustomEnd: row.from_custom_end,
    toCustomStart: row.to_custom_start,
    toCustomEnd: row.to_custom_end,
  }));
}
