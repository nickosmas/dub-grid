import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DbAbsenceType,
  DbEmployee,
  DbFocusArea,
  DbJobDefinition,
  DbRecurringShift,
  DbScheduleCell,
  DbShiftCategory,
} from "@dubgrid/db-types";
import type { Employee } from "@dubgrid/domain";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/cache";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import {
  rowToAbsenceType,
  rowToEmployee,
  rowToFocusArea,
  rowToJobDefinition,
  rowToRecurringShift,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import {
  getProfileOverviewDateRange,
  toPublishedOnlyProfileEntry,
  type ProfileOverviewDateRange,
} from "@/features/account/shared/profile-schedule";
import {
  createAssignmentDefinitionIdByPairMap,
  createShiftJobCompatibilityMaps,
} from "@/lib/shift-job-segments";
import type { RecurringShift, ShiftMap } from "@/types";

export interface SelfProfileSnapshot {
  firstName: string | null;
  lastName: string | null;
  mfaEnabled: boolean;
  termsVersion: string | null;
}

export interface SelfProfileRecord {
  first_name: string | null;
  last_name: string | null;
  mfa_enabled: boolean;
}

export interface SelfWorkProfileSnapshot {
  profile: SelfProfileRecord | null;
  /** False when the caller holds no active membership in the requested org
   *  (or no org was requested), so callers can skip org-scoped requests. */
  isOrgMember: boolean;
  employee: Employee | null;
  /** Management department IDs from `organization_memberships.department_ids`.
   *  Distinct from `employee.departmentIds`, which is the employee's
   *  *scheduled* departments — see get_org_directory's aliasing. */
  managementDepartmentIds: number[];
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
}

export interface AccountIdentitySnapshot {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  orgSlug: string | null;
  hasOrganizationMembership: boolean;
}

const FOCUS_AREA_COLS = "id, org_id, department_id, name, color, sort_order, archived_at";
const SHIFT_CATEGORY_COLS =
  "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
const JOB_COLS =
  "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, job_shift_overrides(shift_id, start_time, end_time, color), default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
const ABSENCE_TYPE_COLS =
  "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
const EMPLOYEE_COLS =
  "id, org_id, employee_number, first_name, last_name, employment_type, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version, created_at";
const RECURRING_SHIFT_COLS =
  "id, emp_id, org_id, day_of_week, state, effective_from, effective_until, created_at, updated_at, archived_at";
const SCHEDULE_CELL_SELECT =
  "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))";

export async function fetchSelfProfileSnapshot(
  userId: string,
): Promise<SelfProfileSnapshot | null> {
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("first_name, last_name, mfa_enabled, terms_version")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
    mfaEnabled: data.mfa_enabled ?? false,
    termsVersion: data.terms_version ?? null,
  };
}

export async function fetchAccountIdentitySnapshot(
  userId: string,
): Promise<AccountIdentitySnapshot> {
  const serviceClient = getServiceClient();
  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] =
    await Promise.all([
      serviceClient.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle(),
      serviceClient
        .from("organization_memberships")
        .select("joined_at, organizations(slug)")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  if (profileError) {
    throw profileError;
  }

  if (membershipError) {
    throw membershipError;
  }

  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const organization = (membership?.organizations as { slug?: string | null } | null) ?? null;

  return {
    firstName,
    lastName,
    displayName,
    orgSlug:
      typeof organization?.slug === "string" && organization.slug.length > 0
        ? organization.slug
        : null,
    hasOrganizationMembership: !!membership,
  };
}

async function fetchLinkedEmployeeByUserId(
  userId: string,
  orgId: string,
): Promise<Employee | null> {
  const { data, error } = await getServiceClient()
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return rowToEmployee(data as DbEmployee);
}

async function fetchOwnMembership(
  userId: string,
  orgId: string,
): Promise<{ departmentIds: number[] } | null> {
  const { data, error } = await getServiceClient()
    .from("organization_memberships")
    .select("user_id, department_ids")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return { departmentIds: (data.department_ids as number[] | null) ?? [] };
}

async function fetchAssignmentContext(orgId: string) {
  const serviceClient = getServiceClient();
  const [focusAreaResult, shiftCategoryResult, jobResult, absenceTypeResult] = await Promise.all([
    serviceClient
      .from("focus_areas")
      .select(FOCUS_AREA_COLS)
      .eq("org_id", orgId)
      .order("sort_order"),
    serviceClient
      .from("shift_categories")
      .select(SHIFT_CATEGORY_COLS)
      .eq("org_id", orgId)
      .order("sort_order"),
    serviceClient.from("jobs").select(JOB_COLS).eq("org_id", orgId).order("sort_order"),
    serviceClient
      .from("absence_types")
      .select(ABSENCE_TYPE_COLS)
      .eq("org_id", orgId)
      .order("sort_order"),
  ]);

  if (focusAreaResult.error) throw focusAreaResult.error;
  if (shiftCategoryResult.error) throw shiftCategoryResult.error;
  if (jobResult.error) throw jobResult.error;
  if (absenceTypeResult.error) throw absenceTypeResult.error;

  const focusAreas = (focusAreaResult.data as DbFocusArea[]).map(rowToFocusArea);
  const shiftCategories = (shiftCategoryResult.data as DbShiftCategory[]).map(rowToShiftCategory);
  const jobs = (jobResult.data as DbJobDefinition[]).map(rowToJobDefinition);
  const absenceTypes = (absenceTypeResult.data as DbAbsenceType[]).map(rowToAbsenceType);
  const assignments = buildScheduleAssignmentOptions({
    orgId,
    focusAreas,
    shiftCategories,
    jobs,
    includeArchived: true,
  });

  return {
    assignments,
    shiftCategories,
    jobs,
    absenceTypeMap: new Map(absenceTypes.map((absenceType) => [absenceType.id, absenceType.name])),
  };
}

async function fetchOrganizationTimeZone(orgId: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.timezone ?? "UTC";
}

export async function fetchProfileOverviewScheduleCells(
  client: SupabaseClient,
  orgId: string,
  employeeId: string,
  range: ProfileOverviewDateRange,
): Promise<DbScheduleCell[]> {
  const { data, error } = await client
    .from("schedule_cells")
    .select(SCHEDULE_CELL_SELECT)
    .eq("org_id", orgId)
    .eq("emp_id", employeeId)
    .gte("date", range.startDate)
    .lte("date", range.endDate)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbScheduleCell[];
}

export async function fetchSelfWorkProfileSnapshot(
  userId: string,
  orgId: string | null,
): Promise<SelfWorkProfileSnapshot> {
  const profileSnapshot = await fetchSelfProfileSnapshot(userId);
  const profile = profileSnapshot
    ? {
        first_name: profileSnapshot.firstName,
        last_name: profileSnapshot.lastName,
        mfa_enabled: profileSnapshot.mfaEnabled,
      }
    : null;

  if (!orgId) {
    return {
      profile,
      isOrgMember: false,
      employee: null,
      managementDepartmentIds: [],
      shifts: {},
      recurringShifts: [],
    };
  }

  // No membership is a legitimate answer, not a failure: a gridmaster viewing
  // an organization through role-scoped impersonation holds none there, and
  // the profile page already renders the no-work-section state for it.
  const membership = await fetchOwnMembership(userId, orgId);
  if (!membership) {
    return {
      profile,
      isOrgMember: false,
      employee: null,
      managementDepartmentIds: [],
      shifts: {},
      recurringShifts: [],
    };
  }
  const managementDepartmentIds = membership.departmentIds;

  const employee = await fetchLinkedEmployeeByUserId(userId, orgId);
  if (!employee) {
    return {
      profile,
      isOrgMember: true,
      employee: null,
      managementDepartmentIds,
      shifts: {},
      recurringShifts: [],
    };
  }

  const [assignmentContext, timeZone] = await Promise.all([
    fetchAssignmentContext(orgId),
    fetchOrganizationTimeZone(orgId),
  ]);
  const { assignments, shiftCategories, jobs, absenceTypeMap } = assignmentContext;
  const assignmentLabelMap = new Map(
    assignments.map((assignment) => [assignment.id, assignment.label]),
  );
  const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(assignments);
  const segmentCompatibility = createShiftJobCompatibilityMaps({
    assignments,
    shiftCategories,
    jobs,
    shiftDisplayMode: "code",
  });
  const serviceClient = getServiceClient();
  const overviewRange = getProfileOverviewDateRange(new Date(), timeZone);

  const [scheduleCellsResult, recurringResult] = await Promise.all([
    fetchProfileOverviewScheduleCells(serviceClient, orgId, employee.id, overviewRange),
    serviceClient
      .from("recurring_shifts")
      .select(RECURRING_SHIFT_COLS)
      .eq("org_id", orgId)
      .eq("emp_id", employee.id)
      .is("archived_at", null)
      .order("day_of_week")
      .order("effective_from", { ascending: false }),
  ]);

  if (recurringResult.error) throw recurringResult.error;

  const shifts: ShiftMap = {};

  for (const row of scheduleCellsResult) {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
      isScheduler: false,
      assignmentLabelMap,
      assignmentIdByPair,
      absenceTypeMap,
    });

    if (!entry) {
      continue;
    }

    shifts[`${row.emp_id}_${row.date}`] = toPublishedOnlyProfileEntry(entry);
  }

  const recurringShifts = ((recurringResult.data ?? []) as DbRecurringShift[]).map((row) =>
    rowToRecurringShift(
      row,
      assignmentLabelMap,
      absenceTypeMap,
      segmentCompatibility,
      assignmentIdByPair,
    ),
  );
  return {
    profile,
    isOrgMember: true,
    employee,
    managementDepartmentIds,
    shifts,
    recurringShifts,
  };
}

export async function updateSelfProfileDetails(input: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  orgId: string | null;
}): Promise<{
  profile: SelfProfileRecord | null;
  employee: Employee | null;
}> {
  const serviceClient = getServiceClient();
  const { error: profileError } = await serviceClient
    .from("profiles")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (profileError) {
    throw profileError;
  }

  let employee: Employee | null = null;
  if (input.orgId) {
    employee = await fetchLinkedEmployeeByUserId(input.userId, input.orgId);
    if (employee) {
      const { error: employeeError } = await serviceClient
        .from("employees")
        .update({
          first_name: input.firstName ?? "",
          last_name: input.lastName ?? "",
        })
        .eq("id", employee.id)
        .eq("org_id", input.orgId);

      if (employeeError) {
        throw employeeError;
      }

      employee = {
        ...employee,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
      };
    }
  }

  return {
    profile: {
      first_name: input.firstName,
      last_name: input.lastName,
      mfa_enabled: (await fetchSelfProfileSnapshot(input.userId))?.mfaEnabled ?? false,
    },
    employee,
  };
}

export async function updateSelfLinkedEmployeePhone(input: {
  userId: string;
  userEmail: string | null;
  orgId: string;
  phone: string;
  expectedVersion?: number;
}): Promise<{ employee: Employee }> {
  const serviceClient = getServiceClient();
  const employee = await fetchLinkedEmployeeByUserId(input.userId, input.orgId);
  if (!employee) {
    throw new Error("This account is not linked to a staff profile.");
  }

  const expectedVersion = input.expectedVersion ?? employee.version;
  const query = serviceClient
    .from("employees")
    .update({
      phone: input.phone.trim(),
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
      version: expectedVersion + 1,
    })
    .eq("id", employee.id)
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .eq("version", expectedVersion);

  const { data, error } = await query.select(EMPLOYEE_COLS).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    const latestEmployee = await fetchLinkedEmployeeByUserId(input.userId, input.orgId);
    throw Object.assign(new Error("Your staff profile changed elsewhere. Refresh and try again."), {
      code: "EMPLOYEE_CONFLICT" as const,
      employee: latestEmployee ?? employee,
    });
  }

  const updatedEmployee = rowToEmployee(data as DbEmployee);
  await Promise.all([
    cacheDel(
      CacheKey.employees(input.orgId),
      CacheKey.orgDirectory(input.orgId),
      CacheKey.tenantStats(),
    ),
    serviceClient.from("audit_log").insert({
      org_id: input.orgId,
      actor_id: input.userId,
      actor_email: input.userEmail,
      action: "employee.updated",
      resource_type: "employee",
      resource_id: employee.id,
      details: {
        source: "self_phone_update",
        changedFields: ["phone"],
      },
    }),
  ]);

  return { employee: updatedEmployee };
}

/** Records two-factor as off, returning whether it was recorded on before. */
export async function recordSelfMfaOff(userId: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("mfa_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  await updateSelfMfaStatus(userId, false);
  return data?.mfa_enabled === true;
}

export async function updateSelfMfaStatus(
  userId: string,
  enabled: boolean,
): Promise<SelfProfileRecord | null> {
  const { error } = await getServiceClient()
    .from("profiles")
    .update({
      mfa_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  const snapshot = await fetchSelfProfileSnapshot(userId);
  return snapshot
    ? {
        first_name: snapshot.firstName,
        last_name: snapshot.lastName,
        mfa_enabled: snapshot.mfaEnabled,
      }
    : null;
}
