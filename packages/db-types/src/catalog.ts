export interface DbFocusArea {
  id: number;
  org_id: string;
  department_id: number | null;
  name: string;
  color: string | null;
  sort_order: number;
  archived_at: string | null;
}

export interface DbDepartment {
  id: number;
  org_id: string;
  name: string;
  abbr: string;
  type: string;
  sort_order: number;
  archived_at: string | null;
  permissions: Record<string, boolean> | null;
}

export interface DbInvitation {
  id: string;
  org_id: string;
  invited_by: string | null;
  email: string;
  role_to_assign: string;
  token?: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string | null;
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  department_ids: number[];
  dept_admin_ids: number[];
}

export interface DbShiftCategory {
  id: number;
  org_id: string;
  name: string;
  abbr: string | null;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  sort_order: number;
  focus_area_id: number | null;
  break_minutes: number | null;
  archived_at: string | null;
}

export interface DbJobDefinition {
  id: number;
  org_id: string;
  name: string;
  abbr: string;
  show_on_grid: boolean;
  assignment_mode: "with_shift" | "shiftless" | "both" | null;
  eligibility_mode: "and" | "or" | null;
  focus_area_ids: number[];
  department_ids: number[];
  applicable_shift_ids: number[];
  eligible_role_ids: number[];
  required_certification_ids: number[];
  color: string;
  border_color: string;
  text_color: string;
  shift_time_overrides: Record<string, { startTime: string | null; endTime: string | null }> | null;
  shift_color_overrides: Record<string, string> | null;
  default_start_time: string | null;
  default_end_time: string | null;
  default_duration_hours: number | null;
  default_duration_minutes: number | null;
  sort_order: number;
  system_key: string | null;
  archived_at: string | null;
}

export interface DbCoverageRequirement {
  id: number;
  org_id: string;
  focus_area_id: number;
  job_id: number | null;
  preferred_shift_id: number | null;
  day_of_week: number | null;
  min_staff: number;
}

export interface DbAssignmentDefinition {
  id: number;
  org_id: string;
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  category_id: number | null;
  shift_id: number | null;
  job_id: number | null;
  is_general: boolean;
  focus_area_id: number | null;
  sort_order: number;
  required_certification_ids: number[];
  default_start_time: string | null;
  default_end_time: string | null;
  default_duration_hours: number | null;
  default_duration_minutes: number | null;
  archived_at: string | null;
}

export interface DbNamedItem {
  id: number;
  org_id: string;
  name: string;
  abbr: string;
  is_schedule_role?: boolean | null;
  department_id: number | null;
  sort_order: number;
  archived_at: string | null;
}

export interface DbAbsenceType {
  id: number;
  org_id: string;
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  sort_order: number;
  archived_at: string | null;
}

export interface DbIndicatorType {
  id: number;
  org_id: string;
  name: string;
  color: string;
  sort_order: number;
  archived_at: string | null;
}
