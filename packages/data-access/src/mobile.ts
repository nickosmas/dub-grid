import type {
  MobileNotification,
  MobileNotificationPriority,
  MobileNotificationsCursor,
  MobileShiftRequestHistoryCursor,
  ScheduleCellState,
} from "@dubgrid/contracts";
import { isNotePublishChangeState, scheduleCellStateSchema } from "@dubgrid/contracts";
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
  "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, job_shift_overrides(shift_id, start_time, end_time, color), default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
const NAMED_ITEM_COLS = "id, org_id, name, abbr, department_ids, sort_order, archived_at";
const ORG_ROLE_COLS =
  "id, org_id, name, abbr, is_schedule_role, department_ids, sort_order, archived_at";
const EMPLOYEE_COLS =
  "id, org_id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version, created_at";
const COVERAGE_REQ_COLS =
  "id, org_id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff";
const DEPARTMENT_COLS = "id, org_id, name, abbr, type, sort_order, archived_at, permissions";
const INVITATION_COLS =
  "id, org_id, invited_by, email, role_to_assign, token, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids";

const POSTGREST_UNSAFE = /[(),."\\]/;
const ISO_TIMESTAMP_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function assertSafeFilterValue(value: string, label: string): void {
  if (POSTGREST_UNSAFE.test(value)) {
    throw new Error(`Unsafe PostgREST filter value for ${label}`);
  }
}

function assertSafeTimestampFilterValue(value: string, label: string): void {
  if (!ISO_TIMESTAMP_WITH_OFFSET.test(value)) {
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

export interface MobileRoleRow extends MobileNamedItemRow {
  required_certification_ids: number[] | null;
}

export interface MobileDepartmentRow extends Pick<DbDepartment, "id" | "name" | "abbr" | "type"> {}

export interface MobileJobNameRow extends Pick<DbJobDefinition, "id" | "name"> {}

export interface MobileProfileNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// Narrower mobile subset of web's PublishChange (apps/web/src/types/index.ts),
// mapped from the schedule_publish_changes child table rows.
export interface MobilePublishChange {
  empId: string;
  date: string;
  kind: "new" | "modified" | "deleted";
  fromState: ScheduleCellState | null;
  toState: ScheduleCellState | null;
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
  "user_id" | "department_ids" | "dept_admin_ids" | "org_role" | "updated_at"
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

// Both snapshots are deliberately retained here so the mobile API can present
// a draft change alongside the last published shift without reimplementing a
// schedule-cells query in the web app.
export interface MobileScheduleComparisonRow {
  emp_id: string;
  date: string;
  focus_area_id: number | null;
  draftState: ScheduleCellState | null;
  draftDeleted: boolean;
  publishedState: ScheduleCellState | null;
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
  | "role_to_assign"
  | "token"
  | "expires_at"
  | "accepted_at"
  | "revoked_at"
  | "updated_at"
  | "employee_id"
  | "first_name"
  | "last_name"
  | "phone"
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

function normalizeMobileScheduleComparisonRow(
  row: MobileScheduleCellQueryRow,
): MobileScheduleComparisonRow | null {
  const snapshots = row.snapshots ?? [];
  const draftSnapshot = snapshots.find(
    (snapshot: DbScheduleCellSnapshot) => snapshot.snapshot_kind === "draft",
  );
  const publishedSnapshot = snapshots.find(
    (snapshot: DbScheduleCellSnapshot) => snapshot.snapshot_kind === "published",
  );
  const employee = normalizeEmbeddedEmployee(row.employees);

  if (!employee || (!draftSnapshot && !publishedSnapshot)) {
    return null;
  }

  return {
    emp_id: row.emp_id,
    date: row.date,
    focus_area_id: row.focus_area_id ?? null,
    draftState:
      draftSnapshot && draftSnapshot.state_kind !== "deleted"
        ? buildStateFromSnapshot(draftSnapshot)
        : null,
    draftDeleted: draftSnapshot?.state_kind === "deleted",
    publishedState:
      publishedSnapshot && publishedSnapshot.state_kind !== "deleted"
        ? buildStateFromSnapshot(publishedSnapshot)
        : null,
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

  const data = await fetchAllMobileRows<Record<string, unknown>>((from, to) =>
    serviceClient
      .from("organization_memberships")
      .select("user_id, department_ids, dept_admin_ids, org_role, updated_at")
      .eq("org_id", orgId)
      .in("user_id", uniqueUserIds)
      .is("archived_at", null)
      .order("user_id", { ascending: true })
      .range(from, to),
  );

  return (
    (data ?? []) as Array<{
      user_id: string;
      department_ids: number[] | null;
      dept_admin_ids: number[] | null;
      org_role: string;
      updated_at: string | null;
    }>
  ).map((row) => ({
    user_id: row.user_id,
    department_ids: row.department_ids ?? [],
    dept_admin_ids: row.dept_admin_ids ?? [],
    org_role: row.org_role,
    updated_at: row.updated_at ?? null,
  }));
}

export interface MobileManagementRosterRows {
  memberships: Array<
    MobileManagementMembershipRow & {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      employee_id: string | null;
      employee_status: string | null;
      phone: string | null;
    }
  >;
  invitations: MobileInvitationRow[];
}

/**
 * The management roster: everyone whose access is scoped to one or more
 * management departments, whether they have an account already or are still
 * only an invitation, and whether or not they also have a staff profile.
 *
 * Built from the two source tables rather than through `get_org_directory`
 * because that RPC pages over the whole people union (staff included) before
 * anything is filtered — a management user past the first page would simply be
 * missing from the roster. Memberships and pending invitations are both small
 * next to the employee table, so this reads less, not more.
 */
export async function fetchMobileManagementRosterRows(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileManagementRosterRows> {
  const [membershipRows, invitationRows] = await Promise.all([
    fetchAllMobileRows<{
      user_id: string;
      org_role: string;
      department_ids: number[] | null;
      dept_admin_ids: number[] | null;
      updated_at: string | null;
      phone: string | null;
    }>((from, to) =>
      serviceClient
        .from("organization_memberships")
        .select("user_id, org_role, department_ids, dept_admin_ids, updated_at, phone")
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("user_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllMobileRows<MobileInvitationRow>((from, to) =>
      serviceClient
        .from("invitations")
        .select(INVITATION_COLS)
        .eq("org_id", orgId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const managementMemberships = membershipRows.filter(
    (row) => (row.department_ids ?? []).length > 0,
  );

  const invitations = invitationRows.filter((row) => (row.department_ids ?? []).length > 0);

  const userIds = managementMemberships.map((row) => row.user_id);
  const [profiles, employeeResult, users] = await Promise.all([
    fetchProfileNameRowsByIds(serviceClient, userIds),
    userIds.length > 0
      ? serviceClient
          .from("employees")
          .select("id, user_id, status")
          .eq("org_id", orgId)
          .in("user_id", userIds)
          .is("archived_at", null)
      : Promise.resolve({ data: [], error: null }),
    // One lookup per management user. The roster is a handful of people, not
    // the staff table, so this stays cheap.
    Promise.all(userIds.map((userId) => serviceClient.auth.admin.getUserById(userId))),
  ]);

  if (employeeResult.error) throw employeeResult.error;

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const employeeByUserId = new Map(
    ((employeeResult.data ?? []) as Array<{ id: string; user_id: string; status: string }>).map(
      (row) => [row.user_id, row],
    ),
  );
  const emailByUserId = new Map(
    users.map((result, index) => [userIds[index], result.data.user?.email ?? null]),
  );

  return {
    memberships: managementMemberships.map((row) => ({
      user_id: row.user_id,
      org_role: row.org_role,
      department_ids: row.department_ids ?? [],
      dept_admin_ids: row.dept_admin_ids ?? [],
      updated_at: row.updated_at ?? null,
      first_name: profileById.get(row.user_id)?.first_name ?? null,
      last_name: profileById.get(row.user_id)?.last_name ?? null,
      email: emailByUserId.get(row.user_id) ?? null,
      employee_id: employeeByUserId.get(row.user_id)?.id ?? null,
      employee_status: employeeByUserId.get(row.user_id)?.status ?? null,
      phone: row.phone ?? null,
    })),
    invitations,
  };
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
): Promise<MobileRoleRow[]> {
  const { data, error } = await serviceClient
    .from("organization_roles")
    .select("id, name, abbr, required_certification_ids")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order");

  if (error) throw error;

  return (data ?? []) as MobileRoleRow[];
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
    .select(
      "published_by, start_date, end_date, published_at, change_count, schedule_publish_changes(emp_id, date, kind, from_state, to_state)",
    )
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

  const rows = (data ?? []) as (Omit<MobilePublishHistoryRow, "changes"> & {
    schedule_publish_changes: {
      emp_id: string;
      date: string;
      kind: string;
      from_state: unknown;
      to_state: unknown;
    }[];
  })[];

  return rows.map(({ schedule_publish_changes, ...row }) => ({
    ...row,
    // Published note changes share this table with cell changes and mobile has
    // no note surface. Left in, their payload fails the cell-state schema and
    // the row would reach the app as a "New" with no states at all.
    changes: (schedule_publish_changes ?? [])
      .filter(
        (c) => !isNotePublishChangeState(c.to_state) && !isNotePublishChangeState(c.from_state),
      )
      .map((c) => ({
        empId: c.emp_id,
        date: c.date,
        kind: c.kind as MobilePublishChange["kind"],
        fromState: scheduleCellStateSchema.safeParse(c.from_state).data ?? null,
        toState: scheduleCellStateSchema.safeParse(c.to_state).data ?? null,
      })),
  }));
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

// Half PostgREST's 1,000-row cap: each cell carries its snapshots and
// segments, so a page of these is a heavy response.
const MOBILE_SCHEDULE_CELL_PAGE_SIZE = 500;

/** Every cell in the range, paged so a large organization or a long range is never silently cut off. */
export async function fetchScheduleCellQueryRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
  pageSize: number = MOBILE_SCHEDULE_CELL_PAGE_SIZE,
): Promise<MobileScheduleCellQueryRow[]> {
  const rows: MobileScheduleCellQueryRow[] = [];
  let from = 0;
  for (;;) {
    const page = await fetchScheduleCellQueryPage(serviceClient, input, from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// A fresh builder per page: Supabase builders are single-use once awaited.
async function fetchScheduleCellQueryPage(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
  from: number,
  to: number,
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
    .lte("date", input.endDate);

  if (input.employeeId) {
    query = query.eq("emp_id", input.employeeId);
  }

  const { data, error } = await query
    // A total order, so consecutive pages never overlap or skip a row.
    .order("date", { ascending: true })
    .order("emp_id", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
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

export async function fetchMobileScheduleComparisonRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<MobileScheduleComparisonRow[]> {
  const rows = await fetchScheduleCellQueryRows(serviceClient, input);

  return rows
    .map((row) => normalizeMobileScheduleComparisonRow(row))
    .filter((row): row is MobileScheduleComparisonRow => row != null);
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

const MOBILE_SHIFT_REQUEST_HISTORY_STATUSES = [
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;

export async function fetchMobileShiftRequestHistoryRows(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
    limit: number;
    cursor?: MobileShiftRequestHistoryCursor | null;
  },
): Promise<{
  rows: MobileShiftRequestQueryRow[];
  nextCursor: MobileShiftRequestHistoryCursor | null;
}> {
  const limit = Math.max(1, Math.min(input.limit, 100));
  let query = serviceClient
    .from("shift_requests")
    .select(
      `*,
       requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
    )
    .eq("org_id", input.orgId)
    .in("status", [...MOBILE_SHIFT_REQUEST_HISTORY_STATUSES])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (input.employeeId) {
    assertSafeFilterValue(input.employeeId, "employeeId");
    query = query.or(
      `requester_emp_id.eq.${input.employeeId},target_emp_id.eq.${input.employeeId}`,
    );
  }

  if (input.cursor) {
    assertSafeTimestampFilterValue(input.cursor.createdAt, "cursor.createdAt");
    assertSafeFilterValue(input.cursor.id, "cursor.id");
    query = query.or(
      `created_at.lt.${input.cursor.createdAt},and(created_at.eq.${input.cursor.createdAt},id.lt.${input.cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const fetchedRows = (data ?? []) as MobileShiftRequestQueryRow[];
  const rows = fetchedRows.slice(0, limit);
  const last = fetchedRows.length > limit ? rows.at(-1) : null;

  return {
    rows,
    nextCursor: last
      ? {
          createdAt: last.created_at,
          id: last.id,
        }
      : null,
  };
}

const MOBILE_PEOPLE_PAGE_SIZE = 500;

/**
 * Every row the query matches, not the first page.
 *
 * PostgREST answers at most `db.max_rows` rows for every role, the service
 * role included, so a single await returns a short list for a large
 * organization and says nothing about it. Each page builds a FRESH query,
 * because a Supabase builder is single-use once awaited.
 */
async function fetchAllMobileRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  pageSize: number = MOBILE_PEOPLE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function fetchMobilePeopleRows(
  serviceClient: SupabaseClient,
  orgId: string,
  pageSize: number = MOBILE_PEOPLE_PAGE_SIZE,
): Promise<MobilePeopleQueryRow[]> {
  // A single unpaged query here would silently truncate at PostgREST's
  // max_rows cap (200 OK, rows just missing) once an org has more employees
  // than the configured limit, mirroring the same failure mode the web
  // /api/employees/manage route guards against with fetchAllRows. Each page
  // builds a FRESH query since Supabase builders are single-use once awaited.
  const rows: MobilePeopleQueryRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await serviceClient
      .from("employees")
      .select(
        "id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, department_ids, dept_admin_ids, phone, email, contact_notes, user_id, version",
      )
      .eq("org_id", orgId)
      .order("first_name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as MobilePeopleQueryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
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

export async function fetchMobileEmployeeRowsByIds(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeIds: readonly string[],
): Promise<DbEmployee[]> {
  const uniqueEmployeeIds = [...new Set(employeeIds)];
  if (uniqueEmployeeIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", orgId)
    .in("id", uniqueEmployeeIds);

  if (error) throw error;

  return (data ?? []) as DbEmployee[];
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
    audit?: {
      actorEmail: string | null;
      actorId: string;
      details?: Record<string, unknown>;
      ipAddress: string | null;
      userAgent: string | null;
    };
  },
): Promise<DbEmployee | null> {
  const { data, error } = await serviceClient.rpc("update_mobile_employee_with_audit", {
    p_actor_email: input.audit?.actorEmail ?? null,
    p_actor_id: input.audit?.actorId ?? null,
    p_audit_details: input.audit?.details ?? null,
    p_certification_id: input.certificationId,
    p_contact_notes: input.contactNotes,
    p_department_ids: input.departmentIds,
    p_email: input.email,
    p_employee_id: input.employeeId,
    p_employment_type: input.employmentType ?? null,
    p_expected_version: input.expectedVersion,
    p_first_name: input.firstName,
    p_focus_area_ids: input.focusAreaIds,
    p_ip_address: input.audit?.ipAddress ?? null,
    p_last_name: input.lastName,
    p_org_id: input.orgId,
    p_phone: input.phone,
    p_role_ids: input.roleIds,
    p_user_agent: input.audit?.userAgent ?? null,
  });

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
    /** Null for a management-only invite, which has no staff profile behind it. */
    employeeId: string | null;
    invitedBy: string;
    email: string;
    roleToAssign: "user" | "admin" | "super_admin";
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    /** Management departments the invite grants once accepted. */
    departmentIds?: number[];
    deptAdminIds?: number[];
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
      ...(input.firstName === undefined ? {} : { first_name: input.firstName }),
      ...(input.lastName === undefined ? {} : { last_name: input.lastName }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.departmentIds === undefined ? {} : { department_ids: input.departmentIds }),
      ...(input.deptAdminIds === undefined ? {} : { dept_admin_ids: input.deptAdminIds }),
    })
    .select(INVITATION_COLS)
    .single();

  if (error) throw error;

  return data as MobileInvitationRow;
}

/**
 * What a rotation replaced, so a failed dispatch can put the invitation back
 * exactly: the link and everything it grants, not the link alone.
 */
export interface MobileInvitationRotation {
  rotatedToken: string;
  previousToken: string;
  previousExpiresAt: string;
  previousRole: string | null;
  previousInvitedBy: string | null;
  previousDepartmentIds: number[] | null;
  previousDeptAdminIds: number[] | null;
}

export async function replaceMobilePendingInvitationAccessRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    invitationId: string;
    expectedUpdatedAt: string | null;
    roleToAssign: "user" | "admin" | "super_admin";
    invitedBy: string;
    departmentIds?: number[];
    deptAdminIds?: number[];
  },
): Promise<{
  rotation: MobileInvitationRotation;
  invitation: MobileInvitationRow;
}> {
  const { data, error } = await serviceClient.rpc("replace_pending_invitation_access", {
    p_org_id: input.orgId,
    p_invitation_id: input.invitationId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_role: input.roleToAssign,
    p_invited_by: input.invitedBy,
    p_department_ids: input.departmentIds ?? null,
    p_dept_admin_ids: input.deptAdminIds ?? null,
  });
  if (error) throw error;

  // Rotation keeps the row, so what comes back is the previous link and grant
  // to restore, not a predecessor id.
  const result = data as {
    invitation_id?: string;
    token?: string;
    previous_token?: string;
    previous_expires_at?: string;
    previous_role?: string | null;
    previous_invited_by?: string | null;
    previous_department_ids?: number[] | null;
    previous_dept_admin_ids?: number[] | null;
  } | null;
  if (
    !result?.invitation_id ||
    !result.token ||
    !result.previous_token ||
    !result.previous_expires_at
  ) {
    throw new Error("Invitation rotation did not return an invitation.");
  }

  const { data: invitation, error: invitationError } = await serviceClient
    .from("invitations")
    .select(INVITATION_COLS)
    .eq("org_id", input.orgId)
    .eq("id", result.invitation_id)
    .single();
  if (invitationError) throw invitationError;

  return {
    rotation: {
      rotatedToken: result.token,
      previousToken: result.previous_token,
      previousExpiresAt: result.previous_expires_at,
      previousRole: result.previous_role ?? null,
      previousInvitedBy: result.previous_invited_by ?? null,
      previousDepartmentIds: result.previous_department_ids ?? null,
      previousDeptAdminIds: result.previous_dept_admin_ids ?? null,
    },
    invitation: invitation as MobileInvitationRow,
  };
}

export async function rollbackMobilePendingInvitationAccessReplacement(
  serviceClient: SupabaseClient,
  input: { orgId: string; invitationId: string } & MobileInvitationRotation,
): Promise<boolean> {
  const { data, error } = await serviceClient.rpc(
    "rollback_pending_invitation_access_replacement",
    {
      p_org_id: input.orgId,
      p_invitation_id: input.invitationId,
      p_rotated_token: input.rotatedToken,
      p_previous_token: input.previousToken,
      p_previous_expires_at: input.previousExpiresAt,
      p_previous_role: input.previousRole,
      p_previous_invited_by: input.previousInvitedBy,
      p_previous_department_ids: input.previousDepartmentIds,
      p_previous_dept_admin_ids: input.previousDeptAdminIds,
    },
  );
  if (error) throw error;
  // The restore is refused when the row has moved on, so an unrestored result
  // is a real failure for the caller to log.
  return (data as { restored?: boolean } | null)?.restored === true;
}

/**
 * Re-point a pending invitation at a different role or set of management
 * departments. Guarded on `expectedUpdatedAt` like every other invitation write
 * here: a null return means someone else changed the row first.
 */
export async function updateMobileInvitationAssignmentsRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    invitationId: string;
    expectedUpdatedAt: string | null;
    roleToAssign: "user" | "admin" | "super_admin";
    departmentIds: number[];
    deptAdminIds: number[];
  },
): Promise<MobileInvitationRow | null> {
  let query = serviceClient
    .from("invitations")
    .update({
      role_to_assign: input.roleToAssign,
      department_ids: input.departmentIds,
      dept_admin_ids: input.deptAdminIds,
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

/**
 * What `change_user_role` did, or why it refused.
 *
 * The RPC signals failure by raising, and the messages are the only thing that
 * distinguishes "someone edited this while you were looking at it" from "this
 * would leave the org with no super admin". Reading them belongs here, next to
 * the SQL it is coupled to, rather than in each route.
 */
export type MobileRoleChangeOutcome =
  | { status: "changed" }
  | { status: "already_applied" }
  | { status: "conflict" }
  | { status: "blocked"; message: string };

/**
 * Change a member's org role through the one path the database allows.
 *
 * A direct `UPDATE ... SET org_role` is rejected by the `guard_org_role_change`
 * trigger ("Direct org_role changes are not allowed"), which is why this cannot
 * go through `updateMobileMembershipAccessRow`. The RPC sets the session flag
 * that lifts the trigger, takes an advisory lock so two callers cannot race, and
 * keeps the last-super-admin guard.
 *
 * Note the RPC gates its own callers on `auth.uid()`, which is NULL under the
 * service role, so those checks quietly pass here: callers must do their own
 * permission check first. The guards that do not read `auth.uid()` — the
 * expected-updated-at check, the self-action check, and the last-super-admin
 * check — still apply.
 */
export async function changeMobileMembershipOrgRole(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    targetUserId: string;
    actorUserId: string;
    orgRole: "user" | "admin" | "super_admin";
    expectedUpdatedAt: string | null;
  },
): Promise<MobileRoleChangeOutcome> {
  const { data, error } = await serviceClient.rpc("change_user_role", {
    p_target_user_id: input.targetUserId,
    p_new_role: input.orgRole,
    p_changed_by_id: input.actorUserId,
    p_idempotency_key: `${input.targetUserId}-${input.orgRole}-${Date.now()}`,
    p_org_id: input.orgId,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("changed elsewhere")) {
      return { status: "conflict" };
    }
    if (message.includes("last super_admin")) {
      return {
        status: "blocked",
        message: "Cannot demote the only super admin. Transfer ownership first.",
      };
    }
    if (message.includes("SELF_ACTION_FORBIDDEN")) {
      return { status: "blocked", message: "You can't change your own role." };
    }
    throw error;
  }

  return (data as { status?: string } | null)?.status === "already_applied"
    ? { status: "already_applied" }
    : { status: "changed" };
}

/**
 * Set a member's management departments in one guarded write.
 * A null return means the `expectedUpdatedAt` check lost — the caller should
 * 409 rather than retry, since the values it was editing are stale.
 *
 * `orgRole` is accepted only so an unchanged role can ride along; an actual
 * role change must go through `changeMobileMembershipOrgRole`, because the
 * database rejects a direct write to that column.
 */
export async function updateMobileMembershipAccessRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    userId: string;
    expectedUpdatedAt: string | null;
    orgRole?: "user" | "admin" | "super_admin";
    departmentIds: number[];
    deptAdminIds: number[];
  },
): Promise<MobileManagementMembershipRow | null> {
  let query = serviceClient
    .from("organization_memberships")
    .update({
      ...(input.orgRole ? { org_role: input.orgRole } : {}),
      department_ids: input.departmentIds,
      dept_admin_ids: input.deptAdminIds,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .is("archived_at", null);

  query = input.expectedUpdatedAt
    ? query.eq("updated_at", input.expectedUpdatedAt)
    : query.is("updated_at", null);

  const { data, error } = await query
    .select("user_id, department_ids, dept_admin_ids, org_role, updated_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as {
    user_id: string;
    department_ids: number[] | null;
    dept_admin_ids: number[] | null;
    org_role: string;
    updated_at: string | null;
  };

  return {
    user_id: row.user_id,
    department_ids: row.department_ids ?? [],
    dept_admin_ids: row.dept_admin_ids ?? [],
    org_role: row.org_role,
    updated_at: row.updated_at ?? null,
  };
}

/** A rotated invitation and the link it replaced, so a failed send can restore it. */
export interface MobileInvitationRefresh {
  invitation: MobileInvitationRow & { token: string };
  previousToken: string;
  previousExpiresAt: string;
}

/**
 * Issue a fresh token and 72 hours on a pending invitation, under the caller's
 * optimistic check. Callers send the new link afterwards and restore the
 * previous one with `restoreMobileEmployeeInvitationRow` if the send fails, so
 * every emailed link was stored and a failed send strands nobody (F-10).
 * A revoked invitation is never revived here.
 */
export async function refreshMobileEmployeeInvitationRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    invitationId: string;
    expectedUpdatedAt: string | null;
  },
): Promise<MobileInvitationRefresh | null> {
  let current = serviceClient
    .from("invitations")
    .select("token, expires_at")
    .eq("org_id", input.orgId)
    .eq("id", input.invitationId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  current = input.expectedUpdatedAt
    ? current.eq("updated_at", input.expectedUpdatedAt)
    : current.is("updated_at", null);
  const { data: before, error: readError } = await current.maybeSingle();
  if (readError) throw readError;
  if (!before) return null;

  // Swapped only while the row still carries the token just read, so a
  // concurrent change wins rather than being overwritten.
  const { data, error } = await serviceClient
    .from("invitations")
    .update({
      token: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    })
    .eq("org_id", input.orgId)
    .eq("id", input.invitationId)
    .eq("token", before.token)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select(INVITATION_COLS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    invitation: data as MobileInvitationRow & { token: string },
    previousToken: before.token as string,
    previousExpiresAt: before.expires_at as string,
  };
}

/**
 * Put back the link a refresh replaced, and any departments the same request
 * changed, while the row still carries the rotated token. Returns false when
 * the row has moved on, which the caller should log.
 */
export async function restoreMobileEmployeeInvitationRow(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    invitationId: string;
    rotatedToken: string;
    previousToken: string;
    previousExpiresAt: string;
    previousDepartmentIds?: number[];
    previousDeptAdminIds?: number[];
  },
): Promise<boolean> {
  const values: Record<string, unknown> = {
    token: input.previousToken,
    expires_at: input.previousExpiresAt,
  };
  if (input.previousDepartmentIds) values.department_ids = input.previousDepartmentIds;
  if (input.previousDeptAdminIds) values.dept_admin_ids = input.previousDeptAdminIds;

  const { data, error } = await serviceClient
    .from("invitations")
    .update(values)
    .eq("org_id", input.orgId)
    .eq("id", input.invitationId)
    .eq("token", input.rotatedToken)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
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
    // The mutation has already committed by the time this best-effort activity
    // write runs. Do not report a failed employee/schedule update after it has
    // succeeded merely because its non-critical audit entry could not be saved.
    console.error("Mobile activity-log write failed", {
      action: input.action,
      orgId: input.org_id,
      resourceType: input.resource_type,
      error,
    });
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
  id?: string;
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

  // A deep link names one alert, which may be archived, read, or older than
  // any page the inbox has loaded. It is a lookup, not a filtered page, so
  // the list filters and the cursor do not apply; row-level security still
  // decides whether this viewer may see the row.
  if (input.id) {
    query = query.eq("id", input.id);
  } else {
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
