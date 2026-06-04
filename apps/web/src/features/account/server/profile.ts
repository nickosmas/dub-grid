import "server-only";

import type {
  DbAbsenceType,
  DbEmployee,
  DbFocusArea,
  DbJobDefinition,
  DbRecurringShift,
  DbScheduleCell,
  DbShiftCategory,
  DbShiftRequest,
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
  rowToShiftRequest,
} from "@/lib/db/mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import {
  createAssignmentDefinitionIdByPairMap,
  createShiftJobCompatibilityMaps,
} from "@/lib/shift-job-segments";
import type {
  RecurringShift,
  ShiftMap,
  ShiftRequest,
} from "@/types";

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
  employee: Employee | null;
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
  shiftRequests: ShiftRequest[];
  auditNames: Array<[string, string]>;
}

export interface AccountIdentitySnapshot {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  orgSlug: string | null;
  hasOrganizationMembership: boolean;
}

const FOCUS_AREA_COLS =
  "id, org_id, department_id, name, color, sort_order, archived_at";
const SHIFT_CATEGORY_COLS =
  "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
const JOB_COLS =
  "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
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
      serviceClient
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle(),
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
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const organization =
    (membership?.organizations as { slug?: string | null } | null) ?? null;

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

async function ensureOrganizationMembership(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("organization_memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}

async function fetchAssignmentContext(orgId: string) {
  const serviceClient = getServiceClient();
  const [focusAreaResult, shiftCategoryResult, jobResult, absenceTypeResult] =
    await Promise.all([
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
      serviceClient
        .from("jobs")
        .select(JOB_COLS)
        .eq("org_id", orgId)
        .order("sort_order"),
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
  const shiftCategories = (shiftCategoryResult.data as DbShiftCategory[]).map(
    rowToShiftCategory,
  );
  const jobs = (jobResult.data as DbJobDefinition[]).map(rowToJobDefinition);
  const absenceTypes = (absenceTypeResult.data as DbAbsenceType[]).map(
    rowToAbsenceType,
  );
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
    absenceTypeMap: new Map(
      absenceTypes.map((absenceType) => [absenceType.id, absenceType.name]),
    ),
  };
}

function mapShiftRequestRows(
  rows: Record<string, unknown>[],
  input: {
    assignmentLabelMap: Map<number, string>;
    assignmentIdByPair: Map<string, number>;
    segmentCompatibility: ReturnType<typeof createShiftJobCompatibilityMaps>;
  },
): ShiftRequest[] {
  return rows.map((row) => {
    const requester = row.requester as
      | { first_name: string; last_name: string }
      | null;
    const target = row.target as
      | { first_name: string; last_name: string }
      | null;

    const mapped: DbShiftRequest = {
      id: row.id as string,
      org_id: row.org_id as string,
      type: row.type as DbShiftRequest["type"],
      status: row.status as DbShiftRequest["status"],
      requester_emp_id: row.requester_emp_id as string,
      requester_shift_date: row.requester_shift_date as string,
      requester_state: row.requester_state as DbShiftRequest["requester_state"],
      target_emp_id: (row.target_emp_id as string | null) ?? null,
      target_shift_date: (row.target_shift_date as string | null) ?? null,
      target_state:
        (row.target_state as DbShiftRequest["target_state"] | null | undefined) ??
        null,
      absence_type_id: (row.absence_type_id as number | null) ?? null,
      parent_request_id: (row.parent_request_id as string | null) ?? null,
      admin_user_id: (row.admin_user_id as string | null) ?? null,
      admin_note: (row.admin_note as string | null) ?? null,
      expires_at: row.expires_at as string,
      resolved_at: (row.resolved_at as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      requester_first_name: requester?.first_name,
      requester_last_name: requester?.last_name,
      target_first_name: target?.first_name ?? null,
      target_last_name: target?.last_name ?? null,
    };

    return rowToShiftRequest(
      mapped,
      input.assignmentLabelMap,
      input.segmentCompatibility,
      input.assignmentIdByPair,
    );
  });
}

async function fetchAuditNames(
  userIds: Iterable<string>,
): Promise<Array<[string, string]>> {
  const ids = Array.from(new Set(Array.from(userIds).filter(Boolean)));
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row: { id: string; first_name: string | null; last_name: string | null }) => {
      const name = [row.first_name?.trim(), row.last_name?.trim()]
        .filter(Boolean)
        .join(" ");
      return name ? ([row.id, name] as [string, string]) : null;
    })
    .filter((entry): entry is [string, string] => entry !== null);
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
      employee: null,
      shifts: {},
      recurringShifts: [],
      shiftRequests: [],
      auditNames: [],
    };
  }

  const hasMembership = await ensureOrganizationMembership(userId, orgId);
  if (!hasMembership) {
    throw new Error("Organization membership not found.");
  }

  const employee = await fetchLinkedEmployeeByUserId(userId, orgId);
  if (!employee) {
    return {
      profile,
      employee: null,
      shifts: {},
      recurringShifts: [],
      shiftRequests: [],
      auditNames: [],
    };
  }

  const { assignments, shiftCategories, jobs, absenceTypeMap } =
    await fetchAssignmentContext(orgId);
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

  const [scheduleCellsResult, recurringResult, shiftRequestsResult] =
    await Promise.all([
      serviceClient
        .from("schedule_cells")
        .select(SCHEDULE_CELL_SELECT)
        .eq("org_id", orgId)
        .eq("emp_id", employee.id)
        .order("date", { ascending: false }),
      serviceClient
        .from("recurring_shifts")
        .select(RECURRING_SHIFT_COLS)
        .eq("org_id", orgId)
        .eq("emp_id", employee.id)
        .is("archived_at", null)
        .order("day_of_week")
        .order("effective_from", { ascending: false }),
      serviceClient
        .from("shift_requests")
        .select(
          `*,
           requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
           target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
        )
        .eq("org_id", orgId)
        .or(`requester_emp_id.eq.${employee.id},target_emp_id.eq.${employee.id}`)
        .order("created_at", { ascending: false }),
    ]);

  if (scheduleCellsResult.error) throw scheduleCellsResult.error;
  if (recurringResult.error) throw recurringResult.error;
  if (shiftRequestsResult.error) throw shiftRequestsResult.error;

  const shifts: ShiftMap = {};
  const auditUserIds = new Set<string>();

  for (const row of (scheduleCellsResult.data ?? []) as DbScheduleCell[]) {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
      isScheduler: true,
      assignmentLabelMap,
      assignmentIdByPair,
      absenceTypeMap,
    });

    if (!entry) {
      continue;
    }

    if (entry.createdBy) auditUserIds.add(entry.createdBy);
    if (entry.updatedBy) auditUserIds.add(entry.updatedBy);
    shifts[`${row.emp_id}_${row.date}`] = entry;
  }

  const recurringShifts = ((recurringResult.data ?? []) as DbRecurringShift[]).map(
    (row) =>
      rowToRecurringShift(
        row,
        assignmentLabelMap,
        absenceTypeMap,
        segmentCompatibility,
        assignmentIdByPair,
      ),
  );
  const shiftRequests = mapShiftRequestRows(
    (shiftRequestsResult.data ?? []) as Record<string, unknown>[],
    {
      assignmentLabelMap,
      assignmentIdByPair,
      segmentCompatibility,
    },
  );
  const auditNames = await fetchAuditNames(auditUserIds);

  return {
    profile,
    employee,
    shifts,
    recurringShifts,
    shiftRequests,
    auditNames,
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

  let query = serviceClient
    .from("employees")
    .update({
      phone: input.phone.trim(),
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employee.id)
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId);

  if (input.expectedVersion !== undefined) {
    query = query.eq("version", input.expectedVersion);
  }

  const { data, error } = await query.select(EMPLOYEE_COLS).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      "Your staff profile changed elsewhere. Refresh and try again.",
    );
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
