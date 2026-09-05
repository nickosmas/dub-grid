import type { ScheduleCellState } from "@dubgrid/contracts";

export interface DbScheduleCellSegment {
  id: string;
  snapshot_id: string;
  org_id: string;
  position: number;
  shift_id: number | null;
  job_id: number;
  is_mentored?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DbScheduleCellSnapshot {
  id: string;
  cell_id: string;
  org_id: string;
  snapshot_kind: "draft" | "published";
  state_kind: "worked" | "absence" | "deleted";
  absence_type_id: number | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  segments?: DbScheduleCellSegment[] | null;
}

export interface DbScheduleCell {
  id: string;
  emp_id: string;
  date: string;
  org_id: string;
  focus_area_id?: number | null;
  version: number;
  series_id?: string | null;
  from_recurring?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  snapshots?: DbScheduleCellSnapshot[] | null;
}

export interface DbScheduleNote {
  id: number;
  org_id: string;
  emp_id: string;
  date: string;
  indicator_type_id: number;
  focus_area_id: number | null;
  status: "published" | "draft" | "draft_deleted";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbRecurringShift {
  id: string;
  emp_id: string;
  org_id: string;
  day_of_week: number;
  state: ScheduleCellState;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TenantStats {
  orgId: string;
  userCount: number;
  employeeCount: number;
}
