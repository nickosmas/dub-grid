import type {
  MobileNotification,
  MobileNotificationPriority,
  MobileNotificationsCursor,
  ScheduleCellState,
} from "@dubgrid/contracts";
import type { AdminPermissions, PlatformRole } from "@dubgrid/domain";
import type {
  DbAbsenceType,
  DbCoverageRequirement,
  DbDepartment,
  DbEmployee,
  DbFocusArea,
  DbInvitation,
  DbJobDefinition,
  DbNamedItem,
  DbOrganization,
  DbOrganizationMembership,
  DbScheduleCell,
  DbScheduleCellSnapshot,
  DbShiftCategory,
} from "@dubgrid/db-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const FOCUS_AREA_COLS = "id, org_id, department_id, name, color, sort_order, archived_at";
const SHIFT_CATEGORY_COLS =
  "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
const JOB_COLS =
  "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
const NAMED_ITEM_COLS = "id, org_id, name, abbr, department_id, sort_order, archived_at";
const ORG_ROLE_COLS =
  "id, org_id, name, abbr, is_schedule_role, department_id, sort_order, archived_at";
const EMPLOYEE_COLS =
  "id, org_id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version, created_at";
const COVERAGE_REQ_COLS =
  "id, org_id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff";
const DEPARTMENT_COLS = "id, org_id, name, abbr, type, sort_order, archived_at, permissions";
const INVITATION_COLS =
  "id, org_id, invited_by, email, role_to_assign, token, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids";

const POSTGREST_UNSAFE = /[(),."\\]/;

function assertSafeFilterValue(value: string, label: string): void {
  if (POSTGREST_UNSAFE.test(value)) {
    throw new Error(`Unsafe PostgREST filter value for ${label}`);
  }
}

function buildShiftRequestDateClauses(
  column: "requester_shift_date" | "target_shift_date",
  input: { startDate?: string; endDate?: string },
): string[] {
  const clauses: string[] = [];
  if (input.startDate) {
    assertSafeFilterValue(input.startDate, "startDate");
    clauses.push(`${column}.gte.${input.startDate}`);
  }
  if (input.endDate) {
    assertSafeFilterValue(input.endDate, "endDate");
    clauses.push(`${column}.lte.${input.endDate}`);
  }
  return clauses;
}

function andFilter(clauses: string[]): string {
  return clauses.length === 1 ? clauses[0] : `and(${clauses.join(",")})`;
}

export interface MobileAbsenceTypeRow extends Pick<
  DbAbsenceType,
  "id" | "label" | "name" | "color" | "border_color" | "text_color"
> {}

export interface MobileFocusAreaRow extends Pick<DbFocusArea, "id" | "name" | "department_id"> {}

export interface MobileNamedItemRow extends Pick<DbNamedItem, "id" | "name" | "abbr"> {}

export interface MobileDepartmentRow extends Pick<DbDepartment, "id" | "name" | "abbr" | "type"> {}

export interface MobileJobNameRow extends Pick<DbJobDefinition, "id" | "name"> {}

export interface MobileProfileNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// Matches web's PublishChange (apps/web/src/types/index.ts) — stored verbatim
// as JSONB on publish_history.changes, written camelCase by web's publish
// action, so the shape carries over as-is.
export interface MobilePublishChange {
  empId: string;
  date: string;
  kind: "new" | "modified" | "deleted";
}

export interface MobilePublishHistoryRow {
  published_by: string | null;
  start_date: string;
  end_date: string;
  published_at: string;
  change_count: number;
  changes: MobilePublishChange[];
}

export interface MobileAcceptedInvitationRow {
  email: string;
  role_to_assign: string;
  accepted_at: string;
}

export interface MobileOrganizationMembershipRow extends Pick<
  DbOrganizationMembership,
  | "user_id"
  | "org_role"
  | "admin_permissions"
  | "joined_at"
  | "updated_at"
  | "department_ids"
  | "dept_admin_ids"
> {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
}

export interface MobileManagementMembershipRow extends Pick<
  DbOrganizationMembership,
  "user_id" | "department_ids" | "dept_admin_ids" | "org_role"
> {}

export interface MobileEmbeddedEmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  org_id: string;
  seniority: number | null;
  focus_area_ids: number[];
}

export interface MobilePublishedScheduleRow {
  emp_id: string;
  date: string;
  focus_area_id: number | null;
  state: ScheduleCellState;
  employees: MobileEmbeddedEmployeeRow;
}

type MobileScheduleCellQueryRow = DbScheduleCell & {
  employees: unknown;
  snapshots?: DbScheduleCellSnapshot[] | null;
};

export interface MobileAssignmentSeedRows {
  focusAreaRows: DbFocusArea[];
  shiftCategoryRows: DbShiftCategory[];
  jobRows: DbJobDefinition[];
  organizationRoleRows: DbNamedItem[];
  certificationRows: DbNamedItem[];
}

export interface MobileOpenShiftContextRows extends MobileAssignmentSeedRows {
  organizationRow: Pick<DbOrganization, "coverage_rule_config"> | null;
  coverageRequirementRows: DbCoverageRequirement[];
  employeeRows: DbEmployee[];
}

export interface MobileShiftRequestQueryRow {
  id: string;
  org_id: string;
  type: string;
  status: string;
  requester_emp_id: string;
  requester_shift_date: string;
  requester_state: ScheduleCellState;
  target_emp_id: string | null;
  target_shift_date: string | null;
  target_state: ScheduleCellState | null;
  absence_type_id: number | null;
  parent_request_id: string | null;
  admin_user_id: string | null;
  admin_note: string | null;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  requester:
    | { first_name: string; last_name: string }
    | Array<{ first_name: string; last_name: string }>
    | null;
  target:
    | { first_name: string; last_name: string }
    | Array<{ first_name: string; last_name: string }>
    | null;
}

export interface MobilePeopleQueryRow {
  id: string;
  employee_number: number;
  first_name: string;
  last_name: string;
  employment_type: DbEmployee["employment_type"] | null;
  status: string | null;
  status_changed_at: string | null;
  status_note: string | null;
  certification_id: number | null;
  role_ids: number[] | null;
  seniority: number | null;
  focus_area_ids: number[] | null;
  department_ids: number[] | null;
  dept_admin_ids: number[] | null;
  phone: string | null;
  email: string | null;
  contact_notes: string | null;
  user_id: string | null;
  version: number | null;
}

export interface MobileInvitationRow extends Pick<
  DbInvitation,
  | "id"
  | "org_id"
  | "email"
  | "token"
  | "expires_at"
  | "accepted_at"
  | "revoked_at"
  | "updated_at"
  | "employee_id"
  | "department_ids"
  | "dept_admin_ids"
> {}

export interface MobilePushTokenRow {
  expo_push_token: string;
}

export interface MobileAuditLogInsertInput {
  org_id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
}

type MembershipOrganizationRelation = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
};

function normalizeMembershipOrganization(
  value: unknown,
): MobileOrganizationMembershipRow["organization"] | null {
  const organization = Array.isArray(value) ? value[0] : value;
  if (!organization || typeof organization !== "object") {
    return null;
  }

  const candidate = organization as MembershipOrganizationRelation;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    slug: typeof candidate.slug === "string" ? candidate.slug : null,
  };
}

function normalizeEmbeddedEmployee(value: unknown): MobileEmbeddedEmployeeRow | null {
  if (Array.isArray(value)) {
    return normalizeEmbeddedEmployee(value[0] ?? null);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MobileEmbeddedEmployeeRow>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.first_name !== "string" ||
    typeof candidate.last_name !== "string" ||
    typeof candidate.org_id !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    org_id: candidate.org_id,
    seniority: typeof candidate.seniority === "number" ? candidate.seniority : null,
    focus_area_ids: Array.isArray(candidate.focus_area_ids)
      ? candidate.focus_area_ids.filter((entry): entry is number => typeof entry === "number")
      : [],
  };
}

function buildStateFromSnapshot(
  snapshot: DbScheduleCellSnapshot,
): MobilePublishedScheduleRow["state"] {
  const orderedSegments = [...(snapshot.segments ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  return snapshot.state_kind === "absence"
    ? {
        kind: "absence",
        segments: [],
        absenceTypeId: snapshot.absence_type_id ?? null,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      }
    : {
        kind: "worked",
        segments: orderedSegments.map((segment) => ({
          shiftId: segment.shift_id ?? null,
          jobId: segment.job_id,
          position: segment.position,
          isMentored: segment.is_mentored ?? false,
        })),
        absenceTypeId: null,
        customStartTime: snapshot.custom_start_time ?? null,
        customEndTime: snapshot.custom_end_time ?? null,
        seriesId: null,
        fromRecurring: false,
      };
}

function normalizePublishedScheduleRow(
  row: MobileScheduleCellQueryRow,
): MobilePublishedScheduleRow | null {
  const publishedSnapshot = (row.snapshots ?? []).find(
    (snapshot: DbScheduleCellSnapshot) => snapshot.snapshot_kind === "published",
  );
  if (!publishedSnapshot) {
    return null;
  }

  const employee = normalizeEmbeddedEmployee(row.employees);
  if (!employee) {
    return null;
  }

  return {
    emp_id: row.emp_id,
    date: row.date,
    focus_area_id: row.focus_area_id ?? null,
    state: buildStateFromSnapshot(publishedSnapshot),
    employees: employee,
  };
}

// Same shape as normalizePublishedScheduleRow, but prefers the draft
// snapshot when one exists — mirrors web's scheduler-effective resolution
// (buildScheduleCellEntry in apps/web/src/lib/schedule-cells.ts: `draft ??
// published`), so callers that need "what a scheduler currently sees,
// including unpublished edits" (e.g. the mobile overtime-watch computation)
// match web instead of silently only counting published hours.
function normalizeEffectiveScheduleRow(
  row: MobileScheduleCellQueryRow,
): MobilePublishedScheduleRow | null {
  const snapshots = row.snapshots ?? [];
  const effectiveSnapshot =
    snapshots.find((snapshot: DbScheduleCellSnapshot) => snapshot.snapshot_kind === "draft") ??
    snapshots.find((snapshot: DbScheduleCellSnapshot) => snapshot.snapshot_kind === "published");
  if (!effectiveSnapshot) {
    return null;
  }

  const employee = normalizeEmbeddedEmployee(row.employees);
  if (!employee) {
    return null;
  }

  return {
    emp_id: row.emp_id,
    date: row.date,
    focus_area_id: row.focus_area_id ?? null,
    state: buildStateFromSnapshot(effectiveSnapshot),
    employees: employee,
  };
}

export async function fetchLinkedEmployeeRowForUser(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<DbEmployee | null> {
  const { data, error } = await serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DbEmployee;
}

export async function fetchMobileOrganizationMembershipRows(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<MobileOrganizationMembershipRow[]> {
  const { data, error } = await serviceClient
    .from("organization_memberships")
    .select(
      `
        user_id,
        org_role,
        admin_permissions,
        joined_at,
        updated_at,
        department_ids,
        dept_admin_ids,
        organizations!inner(id, name, slug)
      `,
    )
    .eq("user_id", userId)
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as Array<{
      user_id: string;
      org_role: string | null;
      admin_permissions: AdminPermissions | null;
      joined_at: string;
      updated_at: string | null;
      department_ids: number[] | null;
      dept_admin_ids: number[] | null;
      organizations: unknown;
    }>
  ).map((row) => {
    const organization = normalizeMembershipOrganization(row.organizations);
    if (!organization) {
      throw new Error("Invalid organization membership relation shape");
    }

    return {
      user_id: row.user_id,
      org_role: row.org_role ?? "user",
      admin_permissions: row.admin_permissions ?? null,
      joined_at: row.joined_at,
      updated_at: row.updated_at,
      department_ids: row.department_ids ?? [],
      dept_admin_ids: row.dept_admin_ids ?? [],
      organization,
    };
  });
}

export async function fetchMobileManagementMembershipRowsByUserIds(
  serviceClient: SupabaseClient,
  orgId: string,
  userIds: string[],
): Promise<MobileManagementMembershipRow[]> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceClient
    .from("organization_memberships")
    .select("user_id, department_ids, dept_admin_ids, org_role")
    .eq("org_id", orgId)
    .in("user_id", uniqueUserIds)
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as Array<{
      user_id: string;
      department_ids: number[] | null;
      dept_admin_ids: number[] | null;
      org_role: string;
    }>
  ).map((row) => ({
    user_id: row.user_id,
    department_ids: row.department_ids ?? [],
    dept_admin_ids: row.dept_admin_ids ?? [],
    org_role: row.org_role,
  }));
}

export async function fetchMobileOrganizationRowById(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<DbOrganization | null> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select(
      "id, name, slug, address, address_line_1, address_line_2, address_city, address_state, address_postal_code, address_country, phone, employee_count, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, pay_period_start_date, archived_at, suspended_at, suspended_reason, enforce_conflict_prevention, subscription_status, trial_ends_at, data_retention_days, feature_overrides, updated_at",
    )
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbOrganization | null | undefined) ?? null;
}

export async function fetchMobileProfilePlatformRole(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<PlatformRole | null> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.platform_role as PlatformRole | null | undefined) ?? null;
}

export async function fetchMobileAssignmentSeedRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileAssignmentSeedRows> {
  const [focusAreaResult, shiftResult, jobResult, roleResult, certificationResult] =
    await Promise.all([
      serviceClient
        .from("focus_areas")
        .select(FOCUS_AREA_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null),
      serviceClient
        .from("shift_categories")
        .select(SHIFT_CATEGORY_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order"),
      serviceClient
        .from("jobs")
        .select(JOB_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order"),
      serviceClient
        .from("organization_roles")
        .select(ORG_ROLE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order"),
      serviceClient
        .from("certifications")
        .select(NAMED_ITEM_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order"),
    ]);

  if (focusAreaResult.error) throw focusAreaResult.error;
  if (shiftResult.error) throw shiftResult.error;
  if (jobResult.error) throw jobResult.error;
  if (roleResult.error) throw roleResult.error;
  if (certificationResult.error) throw certificationResult.error;

  return {
    focusAreaRows: (focusAreaResult.data ?? []) as DbFocusArea[],
    shiftCategoryRows: (shiftResult.data ?? []) as DbShiftCategory[],
    jobRows: (jobResult.data ?? []) as DbJobDefinition[],
    organizationRoleRows: (roleResult.data ?? []) as DbNamedItem[],
    certificationRows: (certificationResult.data ?? []) as DbNamedItem[],
  };
}

export async function fetchMobileAbsenceTypeRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileAbsenceTypeRow[]> {
  const { data, error } = await serviceClient
    .from("absence_types")
    .select("id, label, name, color, border_color, text_color")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("label", { ascending: true });

  if (error) throw error;

  return (data ?? []) as MobileAbsenceTypeRow[];
}

export async function fetchMobileFocusAreaRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileFocusAreaRow[]> {
  const { data, error } = await serviceClient
    .from("focus_areas")
    .select("id, name, department_id")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []) as MobileFocusAreaRow[];
}

export async function fetchMobileRoleRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileNamedItemRow[]> {
  const { data, error } = await serviceClient
    .from("organization_roles")
    .select("id, name, abbr")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order");

  if (error) throw error;

  return (data ?? []) as MobileNamedItemRow[];
}

export async function fetchMobileCertificationRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileNamedItemRow[]> {
  const { data, error } = await serviceClient
    .from("certifications")
    .select("id, name, abbr")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order");

  if (error) throw error;

  return (data ?? []) as MobileNamedItemRow[];
}

export async function fetchMobileDepartmentRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileDepartmentRow[]> {
  const { data, error } = await serviceClient
    .from("departments")
    .select("id, name, abbr, type")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order");

  if (error) throw error;

  return (data ?? []) as MobileDepartmentRow[];
}

export async function fetchMobileJobNameRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileJobNameRow[]> {
  const { data, error } = await serviceClient
    .from("jobs")
    .select("id, name")
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (error) throw error;

  return (data ?? []) as MobileJobNameRow[];
}

export async function fetchMobilePublishHistoryRows(
  serviceClient: SupabaseClient,
  orgId: string,
  input?: {
    startDate?: string;
    endDate?: string;
  },
): Promise<MobilePublishHistoryRow[]> {
  let query = serviceClient
    .from("publish_history")
    .select("published_by, start_date, end_date, published_at, change_count, changes")
    .eq("org_id", orgId)
    .order("published_at", { ascending: false });

  if (input?.startDate) {
    query = query.gte("end_date", input.startDate);
  }
  if (input?.endDate) {
    query = query.lte("start_date", input.endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as MobilePublishHistoryRow[];
}

export async function fetchProfileNameRowsByIds(
  serviceClient: SupabaseClient,
  profileIds: string[],
): Promise<MobileProfileNameRow[]> {
  if (profileIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceClient
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", profileIds);

  if (error) throw error;

  return (data ?? []) as MobileProfileNameRow[];
}

async function fetchScheduleCellQueryRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<MobileScheduleCellQueryRow[]> {
  let query = serviceClient
    .from("schedule_cells")
    .select(
      `
        id,
        emp_id,
        date,
        org_id,
        focus_area_id,
        version,
        series_id,
        from_recurring,
        created_by,
        updated_by,
        created_at,
        updated_at,
        snapshots:schedule_cell_snapshots(
          id,
          cell_id,
          org_id,
          snapshot_kind,
          state_kind,
          absence_type_id,
          custom_start_time,
          custom_end_time,
          segments:schedule_cell_segments(
            id,
            snapshot_id,
            org_id,
            position,
            shift_id,
            job_id,
            is_mentored
          )
        ),
        employees!inner(id, first_name, last_name, org_id, seniority, focus_area_ids)
      `,
    )
    .eq("org_id", input.orgId)
    .gte("date", input.startDate)
    .lte("date", input.endDate)
    .order("date", { ascending: true });

  if (input.employeeId) {
    query = query.eq("emp_id", input.employeeId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as MobileScheduleCellQueryRow[];
}

export async function fetchPublishedMobileScheduleRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<MobilePublishedScheduleRow[]> {
  const rows = await fetchScheduleCellQueryRows(serviceClient, input);

  return rows
    .map((row) => normalizePublishedScheduleRow(row))
    .filter((row): row is MobilePublishedScheduleRow => row != null);
}

// Draft-preferred variant of fetchPublishedMobileScheduleRows — see
// normalizeEffectiveScheduleRow for why this exists.
export async function fetchMobileEffectiveScheduleRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<MobilePublishedScheduleRow[]> {
  const rows = await fetchScheduleCellQueryRows(serviceClient, input);

  return rows
    .map((row) => normalizeEffectiveScheduleRow(row))
    .filter((row): row is MobilePublishedScheduleRow => row != null);
}

export async function fetchMobileOpenShiftContextRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileOpenShiftContextRows> {
  const [assignmentSeedRows, organizationResult, coverageResult, employeeResult] =
    await Promise.all([
      fetchMobileAssignmentSeedRows(serviceClient, orgId),
      serviceClient
        .from("organizations")
        .select("coverage_rule_config")
        .eq("id", orgId)
        .maybeSingle(),
      serviceClient.from("coverage_requirements").select(COVERAGE_REQ_COLS).eq("org_id", orgId),
      serviceClient
        .from("employees")
        .select(EMPLOYEE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .eq("status", "active"),
    ]);

  if (organizationResult.error) throw organizationResult.error;
  if (coverageResult.error) throw coverageResult.error;
  if (employeeResult.error) throw employeeResult.error;

  return {
    ...assignmentSeedRows,
    organizationRow:
      (organizationResult.data as Pick<DbOrganization, "coverage_rule_config"> | null) ?? null,
    coverageRequirementRows: (coverageResult.data ?? []) as DbCoverageRequirement[],
    employeeRows: (employeeResult.data ?? []) as DbEmployee[],
  };
}

export async function fetchMobileShiftRequestRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    includeOpenPickupRequests?: boolean;
    startDate?: string;
    endDate?: string;
  },
): Promise<MobileShiftRequestQueryRow[]> {
  let query = serviceClient
    .from("shift_requests")
    .select(
      `*,
       requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
    )
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: false });

  const hasDateFilter = Boolean(input.startDate || input.endDate);
  if (input.employeeId) {
    assertSafeFilterValue(input.employeeId, "employeeId");
    const filters = [
      andFilter([
        `requester_emp_id.eq.${input.employeeId}`,
        ...buildShiftRequestDateClauses("requester_shift_date", input),
      ]),
      andFilter([
        `target_emp_id.eq.${input.employeeId}`,
        ...buildShiftRequestDateClauses("target_shift_date", input),
      ]),
    ];

    if (input.includeOpenPickupRequests) {
      filters.push(
        andFilter([
          "status.eq.open",
          "type.eq.pickup",
          ...buildShiftRequestDateClauses("requester_shift_date", input),
        ]),
      );
    }

    query = query.or(filters.join(","));
  } else if (hasDateFilter) {
    query = query.or(
      [
        andFilter(buildShiftRequestDateClauses("requester_shift_date", input)),
        andFilter(buildShiftRequestDateClauses("target_shift_date", input)),
      ].join(","),
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as MobileShiftRequestQueryRow[];
}

export async function fetchMobilePeopleRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobilePeopleQueryRow[]> {
  const { data, error } = await serviceClient
    .from("employees")
    .select(
      "id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, department_ids, dept_admin_ids, phone, email, contact_notes, user_id, version",
    )
    .eq("org_id", orgId)
    .order("first_name", { ascending: true });

  if (error) throw error;

  return (data ?? []) as MobilePeopleQueryRow[];
}

export async function fetchMobilePendingInvitationRows(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeIds: string[],
): Promise<MobileInvitationRow[]> {
  if (employeeIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceClient
    .from("invitations")
    .select(INVITATION_COLS)
    .eq("org_id", orgId)
    .in("employee_id", employeeIds)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as MobileInvitationRow[];
}

// Accepted (not pending) invitations within a date range — powers the
// dashboard activity feed's "user_signup" events, matching web's
// buildActivityFeed (apps/web/src/lib/dashboard-stats.ts), which surfaces
// every invitation with a non-null acceptedAt.
export async function fetchMobileAcceptedInvitationRows(
  serviceClient: SupabaseClient,
  orgId: string,
  input: { startDate: string; endDate: string },
): Promise<MobileAcceptedInvitationRow[]> {
  const { data, error } = await serviceClient
    .from("invitations")
    .select("email, role_to_assign, accepted_at")
    .eq("org_id", orgId)
    .not("accepted_at", "is", null)
    .gte("accepted_at", `${input.startDate}T00:00:00.000Z`)
    .lte("accepted_at", `${input.endDate}T23:59:59.999Z`)
    .order("accepted_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as MobileAcceptedInvitationRow[];
}

export async function fetchMobileEmployeeRowById(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
): Promise<DbEmployee | null> {
  const { data, error } = await serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("id", employeeId)
    .eq("org_id", orgId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as DbEmployee;
}

export async function updateMobileEmployeeStatusRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    status: DbEmployee["status"];
    statusNote: string;
    statusChangedAt: string;
    archivedAt?: string | null;
  },
): Promise<DbEmployee | null> {
  const update: Record<string, unknown> = {
    status: input.status,
    status_note: input.statusNote,
    status_changed_at: input.statusChangedAt,
    version: input.expectedVersion + 1,
  };

  if (input.archivedAt !== undefined) {
    update.archived_at = input.archivedAt;
  }

  const { data, error } = await serviceClient
    .from("employees")
    .update(update)
    .eq("id", input.employeeId)
    .eq("org_id", input.orgId)
    .eq("version", input.expectedVersion)
    .select(EMPLOYEE_COLS)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbEmployee | null | undefined) ?? null;
}

export async function updateMobileEmployeeDetailsRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    expectedVersion: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    contactNotes: string;
    certificationId: number | null;
    focusAreaIds: number[];
    roleIds: number[];
    departmentIds: number[];
    employmentType?: DbEmployee["employment_type"];
  },
): Promise<DbEmployee | null> {
  const { data, error } = await serviceClient
    .from("employees")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      email: input.email,
      contact_notes: input.contactNotes,
      certification_id: input.certificationId,
      focus_area_ids: input.focusAreaIds,
      role_ids: input.roleIds,
      department_ids: input.departmentIds,
      ...(input.employmentType ? { employment_type: input.employmentType } : {}),
      version: input.expectedVersion + 1,
    })
    .eq("id", input.employeeId)
    .eq("org_id", input.orgId)
    .eq("version", input.expectedVersion)
    .select(EMPLOYEE_COLS)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbEmployee | null | undefined) ?? null;
}

export async function fetchMobilePendingInvitationRowByEmployeeId(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
): Promise<MobileInvitationRow | null> {
  const { data, error } = await serviceClient
    .from("invitations")
    .select(INVITATION_COLS)
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as MobileInvitationRow | null | undefined) ?? null;
}

export async function createMobileEmployeeInvitationRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId: string;
    invitedBy: string;
    email: string;
    roleToAssign: "user" | "admin";
  },
): Promise<MobileInvitationRow> {
  const { data, error } = await serviceClient
    .from("invitations")
    .insert({
      org_id: input.orgId,
      employee_id: input.employeeId,
      invited_by: input.invitedBy,
      email: input.email.toLowerCase(),
      role_to_assign: input.roleToAssign,
    })
    .select(INVITATION_COLS)
    .single();

  if (error) throw error;

  return data as MobileInvitationRow;
}

export async function refreshMobileEmployeeInvitationRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    invitationId: string;
    expectedUpdatedAt: string | null;
  },
): Promise<MobileInvitationRow | null> {
  let query = serviceClient
    .from("invitations")
    .update({
      token: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", input.orgId)
    .eq("id", input.invitationId)
    .is("accepted_at", null);

  query = input.expectedUpdatedAt
    ? query.eq("updated_at", input.expectedUpdatedAt)
    : query.is("updated_at", null);

  const { data, error } = await query.select(INVITATION_COLS).maybeSingle();

  if (error) throw error;

  return (data as MobileInvitationRow | null | undefined) ?? null;
}

export async function revokeMobileEmployeeInvitationRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    invitationId: string;
    expectedUpdatedAt: string | null;
  },
): Promise<MobileInvitationRow | null> {
  let query = serviceClient
    .from("invitations")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", input.orgId)
    .eq("id", input.invitationId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  query = input.expectedUpdatedAt
    ? query.eq("updated_at", input.expectedUpdatedAt)
    : query.is("updated_at", null);

  const { data, error } = await query.select(INVITATION_COLS).maybeSingle();

  if (error) throw error;

  return (data as MobileInvitationRow | null | undefined) ?? null;
}

export async function fetchMobileActiveMembershipOrgRole(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await serviceClient
    .from("organization_memberships")
    .select("org_role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;

  return (data?.org_role as string | null | undefined) ?? null;
}

export async function countMobileActiveSuperAdmins(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { count, error } = await serviceClient
    .from("organization_memberships")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("org_role", "super_admin")
    .is("archived_at", null);

  if (error) throw error;

  return count ?? 0;
}

export async function archiveMobileOrganizationMembership(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    userId: string;
    archivedByUserId: string;
    archivedAt: string;
  },
): Promise<void> {
  const { error } = await serviceClient
    .from("organization_memberships")
    .update({ archived_at: input.archivedAt, archived_by: input.archivedByUserId })
    .eq("user_id", input.userId)
    .eq("org_id", input.orgId)
    .is("archived_at", null);

  if (error) throw error;
}

export async function restoreMobileOrganizationMembership(
  serviceClient: SupabaseClient,
  input: { orgId: string; userId: string },
): Promise<void> {
  const { error } = await serviceClient
    .from("organization_memberships")
    .update({ archived_at: null, archived_by: null })
    .eq("user_id", input.userId)
    .eq("org_id", input.orgId)
    .not("archived_at", "is", null);

  if (error) throw error;
}

export async function insertMobileAuditLogEntry(
  serviceClient: SupabaseClient,
  input: MobileAuditLogInsertInput,
): Promise<void> {
  const { error } = await serviceClient.from("audit_log").insert(input);

  if (error) {
    throw error;
  }
}

export async function upsertMobilePushTokenRow(
  serviceClient: SupabaseClient,
  input: {
    userId: string;
    orgId: string;
    platform: "ios" | "android";
    expoPushToken: string;
    disabled?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await serviceClient.from("mobile_device_tokens").upsert(
    {
      user_id: input.userId,
      org_id: input.orgId,
      platform: input.platform,
      expo_push_token: input.expoPushToken,
      last_seen_at: now,
      disabled_at: input.disabled ? now : null,
    },
    {
      onConflict: "expo_push_token",
    },
  );

  if (error) {
    throw error;
  }
}

export async function fetchActiveMobilePushTokenRows(
  serviceClient: SupabaseClient,
  input: {
    userId: string;
    orgId: string;
  },
): Promise<MobilePushTokenRow[]> {
  const { data, error } = await serviceClient
    .from("mobile_device_tokens")
    .select("expo_push_token")
    .eq("user_id", input.userId)
    .eq("org_id", input.orgId)
    .is("disabled_at", null);

  if (error) {
    throw error;
  }

  return (data ?? []) as MobilePushTokenRow[];
}

export async function fetchMobileUnreadNotificationCount(
  userClient: SupabaseClient,
): Promise<number> {
  const { data, error } = await userClient.rpc("get_unread_notification_count");

  if (error) throw error;

  return (data as number) ?? 0;
}

export async function fetchMobileNotificationFacets(userClient: SupabaseClient): Promise<{
  totalInbox: number;
  totalUnread: number;
  totalArchived: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  const { data, error } = await userClient.rpc("get_notification_facets");

  if (error) throw error;

  const raw = (data ?? {}) as {
    totalInbox?: number;
    totalUnread?: number;
    totalArchived?: number;
    byCategory?: Record<string, number>;
    byPriority?: Record<string, number>;
  };

  return {
    totalInbox: raw.totalInbox ?? 0,
    totalUnread: raw.totalUnread ?? 0,
    totalArchived: raw.totalArchived ?? 0,
    byCategory: raw.byCategory ?? {},
    byPriority: raw.byPriority ?? {},
  };
}

export type FetchMobileNotificationsInput = {
  limit: number;
  cursor?: MobileNotificationsCursor | null;
  category?: string;
  type?: string;
  priority?: MobileNotificationPriority;
  read?: "read" | "unread";
  search?: string;
  archived?: "inbox" | "archived" | "any";
  sort?: "asc" | "desc";
};

const MOBILE_NOTIFICATION_COLUMNS =
  "id, type, channel, category, priority, title, message, metadata, read_at, archived_at, created_at";

export async function fetchMobileNotificationsPage(
  userClient: SupabaseClient,
  input: FetchMobileNotificationsInput,
): Promise<{
  unreadCount: number;
  notifications: MobileNotification[];
  nextCursor: MobileNotificationsCursor | null;
}> {
  const limit = Math.max(1, Math.min(input.limit, 100));
  const sort = input.sort ?? "desc";
  const ascending = sort === "asc";

  let query = userClient
    .from("notifications")
    .select(MOBILE_NOTIFICATION_COLUMNS)
    .eq("channel", "in_app")
    .order("created_at", { ascending })
    .order("id", { ascending })
    .limit(limit + 1);

  const archived = input.archived ?? "inbox";
  if (archived === "archived") {
    query = query.not("archived_at", "is", null);
  } else if (archived === "inbox") {
    query = query.is("archived_at", null);
  }

  if (input.read === "unread") {
    query = query.is("read_at", null);
  } else if (input.read === "read") {
    query = query.not("read_at", "is", null);
  }

  if (input.category) {
    query = query.eq("category", input.category);
  }

  if (input.type) {
    query = query.eq("type", input.type);
  }

  if (input.priority) {
    query = query.eq("priority", input.priority);
  }

  if (input.search) {
    const term = input.search.replace(/[%,]/g, " ").trim();
    if (term) {
      const pattern = `%${term}%`;
      query = query.or(`title.ilike.${pattern},message.ilike.${pattern}`);
    }
  }

  if (input.cursor) {
    const cmp = ascending ? "gt" : "lt";
    // Keyset on (created_at, id) tuple. Postgres row-value compare is exposed
    // via PostgREST's `or` with explicit equality on the tiebreaker.
    query = query.or(
      [
        `created_at.${cmp}.${input.cursor.createdAt}`,
        `and(created_at.eq.${input.cursor.createdAt},id.${cmp}.${input.cursor.id})`,
      ].join(","),
    );
  }

  const [{ data: rows, error: notificationError }, { data: unreadCount, error: unreadError }] =
    await Promise.all([query, userClient.rpc("get_unread_notification_count")]);

  if (notificationError) throw notificationError;
  if (unreadError) throw unreadError;

  const fetched = (rows ?? []) as Array<Record<string, unknown>>;
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;

  const notifications: MobileNotification[] = page.map((row) => ({
    id: row.id as string,
    type: row.type as MobileNotification["type"],
    channel: (row.channel as "in_app" | "email") ?? "in_app",
    category: (row.category as string | null) ?? null,
    priority: (row.priority as MobileNotificationPriority) ?? "normal",
    title: row.title as string,
    message: row.message as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    readAt: (row.read_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  const last = hasMore ? notifications[notifications.length - 1] : null;
  const nextCursor: MobileNotificationsCursor | null = last
    ? { createdAt: last.createdAt, id: last.id }
    : null;

  return {
    unreadCount: (unreadCount as number) ?? 0,
    notifications,
    nextCursor,
  };
}
