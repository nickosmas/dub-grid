import type { AdminPermissions } from "@dubgrid/domain";

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
  workspace_kind: "real" | "sandbox";
  sandbox_owner_user_id: string | null;
  sandbox_source_org_id: string | null;
  enforce_conflict_prevention: boolean;
  coverage_rule_config?: Record<string, unknown> | null;
  open_shift_visibility?: Record<string, unknown> | null;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  trial_started_at: string | null;
  subscription_seats: number | null;
  data_retention_days: number;
  feature_overrides: Record<string, boolean>;
  updated_at: string | null;
}

export interface DbOrganizationMembership {
  id: number;
  user_id: string;
  org_id: string;
  org_role: string;
  admin_permissions: AdminPermissions | null;
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
