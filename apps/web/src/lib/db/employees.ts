import {
  supabase,
  cacheThrough,
  cacheDel,
  CacheKey,
  TTL,
  logAudit,
  EMPLOYEE_COLS,
  DEPARTMENT_COLS,
  saveNamedEntities,
} from "./shared";
import { fetchAssignmentDefinitions } from "./config";
import { parseNameMismatchResponse } from "@/lib/account-linking";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { DbEmployee, DbInvitation, DbScheduleCell } from "./types";
import { rowToEmployee, rowToDepartment, rowToInvitation } from "./mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";
import type { Employee, Department, ShiftMap, Invitation, EmployeeStatus } from "@/types";

export class EmployeeStatusConflictError extends Error {
  constructor(public readonly latestEmployee: Employee) {
    super("Employee status changed elsewhere.");
    this.name = "EmployeeStatusConflictError";
  }
}

// ── Departments ──────────────────────────────────────────────────────────────

export async function fetchDepartments(
  orgId: string,
  includeArchived = false,
): Promise<Department[]> {
  if (includeArchived) {
    const { data, error } = await supabase
      .from("departments")
      .select(DEPARTMENT_COLS)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToDepartment);
  }
  return cacheThrough(CacheKey.departments(orgId), TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("departments")
      .select(DEPARTMENT_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToDepartment);
  });
}

export async function saveDepartments(
  orgId: string,
  items: Department[],
  existing: Department[],
): Promise<Department[]> {
  const { created, updated, archived } = await saveNamedEntities({
    table: "departments",
    orgId,
    items,
    existing,
    toRow: (item, sortOrder) => ({
      name: item.name,
      abbr: item.abbr || "",
      type: item.type,
      sort_order: sortOrder,
      permissions: item.permissions ?? null,
    }),
  });

  await cacheDel(CacheKey.departments(orgId), CacheKey.orgDirectory(orgId));
  void logAudit("departments.saved", "department", null, { created, updated, archived }, orgId);
  return fetchDepartments(orgId);
}

export async function checkDepartmentDependencies(
  deptId: number,
  orgId: string,
): Promise<{ hasDependencies: boolean; summary: string }> {
  const [empRes, faRes, roleRes, jobRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("department_ids", [deptId]),
    supabase
      .from("focus_areas")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("department_id", deptId),
    supabase
      .from("organization_roles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("department_id", deptId),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("department_ids", [deptId]),
  ]);
  const parts = [
    empRes.count ? `${empRes.count} employee${empRes.count !== 1 ? "s" : ""}` : "",
    faRes.count ? `${faRes.count} focus area${faRes.count !== 1 ? "s" : ""}` : "",
    roleRes.count ? `${roleRes.count} role${roleRes.count !== 1 ? "s" : ""}` : "",
    jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  if (parts.length === 0) return { hasDependencies: false, summary: "" };
  return { hasDependencies: true, summary: `Used by ${parts.join(" and ")}` };
}

export async function restoreDepartment(deptId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("departments")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", deptId);
  if (error) throw error;
  await cacheDel(CacheKey.departments(orgId), CacheKey.orgDirectory(orgId));
  void logAudit("department.restored", "department", String(deptId), {}, orgId);
}

// ── Employees ────────────────────────────────────────────────────────────────

export async function fetchEmployees(
  orgId: string,
  statuses?: EmployeeStatus[],
): Promise<Employee[]> {
  let query = supabase.from("employees").select(EMPLOYEE_COLS).eq("org_id", orgId);
  // Removed employees have archived_at set, so skip the filter when fetching them
  const includesRemoved = statuses?.includes("removed");
  if (!includesRemoved) {
    query = query.is("archived_at", null);
  }
  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }
  const { data, error } = await query.order("seniority");
  if (error) throw error;
  return (data as DbEmployee[]).map(rowToEmployee);
}

export async function fetchEmployeeCount(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (error) throw error;
  return count ?? 0;
}

async function updateEmployeeStatus(input: {
  empId: string;
  orgId: string;
  action: "deactivate" | "activate" | "remove";
  expectedVersion: number;
  note?: string;
}): Promise<Employee> {
  const response = await fetch("/api/employees/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    employee?: Employee;
  } | null;

  if (response.status === 409 && body?.employee) {
    throw new EmployeeStatusConflictError(body.employee);
  }

  if (!response.ok || !body?.employee) {
    throw new Error(
      formatClientErrorMessage(body?.error, "We couldn't update their status. Try again."),
    );
  }

  await cacheDel(
    CacheKey.employeeDetail(input.empId),
    CacheKey.tenantStats(),
    CacheKey.employees(input.orgId),
    CacheKey.orgDirectory(input.orgId),
  );

  return body.employee;
}

export async function removeEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "remove",
    expectedVersion,
  });
}

export async function deactivateEmployee(
  empId: string,
  note: string | undefined,
  orgId: string,
  expectedVersion: number,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "deactivate",
    note,
    expectedVersion,
  });
}

export async function activateEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "activate",
    expectedVersion,
  });
}

export interface CreateEmployeeFromOrgUserInput {
  orgId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  contactNotes?: string;
}

export async function createEmployeeFromOrgUser(
  input: CreateEmployeeFromOrgUserInput,
): Promise<Employee> {
  return postCreateEmployeeFromOrgUser("/api/employees/from-user", input);
}

export async function reconcileEmployeeFromOrgUser(
  input: CreateEmployeeFromOrgUserInput,
): Promise<Employee> {
  return postCreateEmployeeFromOrgUser("/api/employees/from-user/reconcile", input);
}

async function postCreateEmployeeFromOrgUser(
  url: string,
  input: CreateEmployeeFromOrgUserInput,
): Promise<Employee> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    employee?: Employee;
  } | null;
  const mismatchError = parseNameMismatchResponse(payload);
  if (mismatchError) throw mismatchError;
  if (!response.ok || !payload?.employee) {
    throw new Error(
      formatClientErrorMessage(
        payload?.error,
        "We couldn't add management user to the schedule. Try again.",
      ),
    );
  }
  return payload.employee;
}

// ── Single Employee Fetch ──────────────────────────────────────────────────────

export async function fetchEmployeeById(empId: string, orgId: string): Promise<Employee | null> {
  return cacheThrough(CacheKey.employeeDetail(empId), TTL.MODERATE, async () => {
    const { data, error } = await supabase
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", empId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToEmployee(data as DbEmployee);
  });
}

export async function fetchEmployeeByUserId(
  userId: string,
  orgId: string,
): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToEmployee(data as DbEmployee);
}

// ── Employee Shifts (date-range scoped) ──────────────────────────────────────

const MAX_RANGE_DAYS = 366;

export async function fetchEmployeeShifts(
  empId: string,
  orgId: string,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Promise<ShiftMap> {
  if (startDate && endDate) {
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (diffMs > MAX_RANGE_DAYS * 86_400_000) {
      throw new Error(`Shift query range exceeds ${MAX_RANGE_DAYS} days`);
    }
  }
  const atMap = absenceTypeMap ?? new Map<number, string>();
  const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(
    await fetchAssignmentDefinitions(orgId, true),
  );

  let normalizedQuery = supabase
    .from("schedule_cells")
    .select(
      "id, emp_id, date, org_id, version, series_id, from_recurring, created_by, updated_by, created_at, updated_at, snapshots:schedule_cell_snapshots(id, cell_id, org_id, snapshot_kind, state_kind, absence_type_id, custom_start_time, custom_end_time, created_at, updated_at, segments:schedule_cell_segments(id, snapshot_id, org_id, position, shift_id, job_id, is_mentored, created_at, updated_at))",
    )
    .eq("org_id", orgId)
    .eq("emp_id", empId)
    .order("date", { ascending: false });
  if (startDate) normalizedQuery = normalizedQuery.gte("date", startDate);
  if (endDate) normalizedQuery = normalizedQuery.lte("date", endDate);

  const { data, error } = await normalizedQuery;
  if (error) throw error;

  const map: ShiftMap = {};
  for (const row of (data ?? []) as DbScheduleCell[]) {
    const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
      isScheduler: true,
      assignmentLabelMap,
      assignmentIdByPair,
      absenceTypeMap: atMap,
    });
    if (entry) {
      map[`${row.emp_id}_${row.date}`] = entry;
    }
  }
  return map;
}

// ── Employee Invitations ─────────────────────────────────────────────────────

export async function fetchEmployeeInvitations(
  orgId: string,
  employeeId: string,
): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select(
      "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
    )
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: DbInvitation) => rowToInvitation(row));
}
