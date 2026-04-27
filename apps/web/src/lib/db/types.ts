import type {
  EmployeeStatus,
  RecurringScheduleDraft,
  ScheduleCellState,
  ScheduleCellInput,
  ShiftRequestStatus,
  ShiftRequestType,
} from "@/types";

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface DbOrganization {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  address_line_1: string;
  address_line_2: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
  address_country: string;
  phone: string;
  employee_count: number | null;
  focus_area_label: string | null;
  certification_label: string | null;
  role_label: string | null;
  department_label: string | null;
  shift_display_mode: string | null;
  timezone: string | null;
  pay_period_start_date: string | null;
  archived_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  enforce_conflict_prevention: boolean;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_seats: number | null;
  data_retention_days: number;
  feature_overrides: Record<string, boolean>;
  updated_at: string | null;
}

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

export interface DbOrganizationMembership {
  id: number;
  user_id: string;
  org_id: string;
  org_role: string;
  admin_permissions: Record<string, boolean> | null;
  joined_at: string;
  updated_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  department_ids: number[];
  dept_admin_ids: number[];
  phone: string | null;
  onboarding_completed_at: string | null;
  tooltip_tours_completed: Record<string, string>;
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

export interface DbEmployee {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  status: EmployeeStatus;
  status_changed_at: string | null;
  status_note: string;
  certification_id: number | null;
  role_ids: number[];
  seniority: number;
  focus_area_ids: number[];
  phone: string;
  email: string;
  contact_notes: string;
  archived_at: string | null;
  user_id: string | null;
  department_ids: number[];
  dept_admin_ids: number[];
  version: number;
}

export interface DbScheduleCellSegment {
  id: string;
  snapshot_id: string;
  org_id: string;
  position: number;
  shift_id: number | null;
  job_id: number;
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
  status: 'published' | 'draft' | 'draft_deleted';
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

export interface RecurringDraft {
  id: string;
  orgId: string;
  savedBy: string;
  draftData: RecurringScheduleDraft;
  savedAt: string;
}

export interface TenantStats {
  orgId: string;
  userCount: number;
  employeeCount: number;
}

export interface DbShiftRequest {
  id: string;
  org_id: string;
  type: ShiftRequestType;
  status: ShiftRequestStatus;
  requester_emp_id: string;
  requester_shift_date: string;
  requester_state: ScheduleCellState;
  target_emp_id: string | null;
  target_shift_date: string | null;
  target_state?: ScheduleCellState | null;
  absence_type_id: number | null;
  parent_request_id: string | null;
  admin_user_id: string | null;
  admin_note: string | null;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from employees
  requester_first_name?: string;
  requester_last_name?: string;
  target_first_name?: string | null;
  target_last_name?: string | null;
}

export type { ScheduleCellInput };
