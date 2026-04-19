import {
  supabase, cacheThrough, cacheDel, CacheKey, TTL, logAudit,
  EMPLOYEE_COLS, DEPARTMENT_COLS, OptimisticLockError,
} from "./shared";
import { parseNameMismatchResponse } from "@/lib/account-linking";
import type { DbEmployee, DbInvitation, DbShift } from "./types";
import { mapDbShiftRowToShiftEntry } from "./shift-row-mapper";
import { rowToEmployee, employeeToRow, rowToDepartment, rowToInvitation } from "./mappers";
import type {
  Employee, Department, ShiftMap, Invitation,
  AdminPermissions, EmployeeStatus,
  AuditLogEntry,
} from "@/types";

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
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("departments")
      .update({ archived_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  // Separate update + insert to avoid GENERATED ALWAYS identity column errors
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  for (const { item, sortOrder } of toUpdate) {
    const { error } = await supabase
      .from("departments")
      .update({ name: item.name, abbr: item.abbr || "", type: item.type, sort_order: sortOrder, permissions: item.permissions ?? null })
      .eq("org_id", orgId)
      .eq("id", item.id);
    if (error) throw error;
  }
  // Insert new items — restore archived rows with matching names instead of inserting duplicates
  for (const { item, sortOrder } of toInsert) {
    const { data: archived } = await supabase
      .from("departments")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", item.name)
      .not("archived_at", "is", null)
      .maybeSingle();
    if (archived) {
      const { error } = await supabase
        .from("departments")
        .update({ name: item.name, abbr: item.abbr || "", type: item.type, sort_order: sortOrder, archived_at: null, permissions: item.permissions ?? null })
        .eq("id", archived.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("departments")
        .insert({ org_id: orgId, name: item.name, abbr: item.abbr || "", type: item.type, sort_order: sortOrder, permissions: item.permissions ?? null });
      if (error) throw error;
    }
  }

  await cacheDel(CacheKey.departments(orgId), CacheKey.orgDirectory(orgId));
  void logAudit("departments.saved", "department", null, { created: toInsert.length, updated: toUpdate.length, archived: toDelete.length }, orgId);
  return fetchDepartments(orgId);
}

export async function checkDepartmentDependencies(deptId: number, orgId: string): Promise<{ hasDependencies: boolean; summary: string }> {
  const [empRes, faRes, roleRes] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).contains("department_ids", [deptId]),
    supabase.from("focus_areas").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).eq("department_id", deptId),
    supabase.from("organization_roles").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).eq("department_id", deptId),
  ]);
  const parts = [
    empRes.count ? `${empRes.count} employee${empRes.count !== 1 ? "s" : ""}` : "",
    faRes.count ? `${faRes.count} focus area${faRes.count !== 1 ? "s" : ""}` : "",
    roleRes.count ? `${roleRes.count} role${roleRes.count !== 1 ? "s" : ""}` : "",
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

/** Update the permission template for a management department. */
export async function updateDepartmentPermissions(
  departmentId: number,
  permissions: AdminPermissions,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from("departments")
    .update({ permissions })
    .eq("id", departmentId)
    .eq("org_id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.departments(orgId), CacheKey.orgDirectory(orgId));
  void logAudit("department_permissions.updated", "department", String(departmentId), {}, orgId);
}

/** Fetch department-based permissions for a user (union of templates from depts where they're an admin). */
export async function fetchUserDepartmentPermissions(
  userId: string,
  orgId: string,
): Promise<AdminPermissions | null> {
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("dept_admin_ids")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();

  // Only union templates from departments where the user is a dept admin
  const deptIds: number[] = (membership?.dept_admin_ids as number[]) ?? [];
  if (deptIds.length === 0) return null;

  const { data: depts } = await supabase
    .from("departments")
    .select("permissions")
    .in("id", deptIds)
    .eq("type", "management")
    .not("permissions", "is", null);

  if (!depts || depts.length === 0) return null;

  // Union: most permissive wins per boolean field
  const { unionPermissions } = await import("@/features/permissions");
  return unionPermissions(depts.map((d: { permissions: unknown }) => d.permissions as AdminPermissions));
}

// ── Employees ────────────────────────────────────────────────────────────────

export async function fetchEmployees(
  orgId: string,
  statuses?: EmployeeStatus[],
): Promise<Employee[]> {
  let query = supabase
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", orgId);
  // Terminated employees have archived_at set, so skip the filter when fetching them
  const includesTerminated = statuses?.includes("terminated");
  if (!includesTerminated) {
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

export async function insertEmployee(
  data: Omit<Employee, "id">,
  orgId: string,
): Promise<Employee> {
  const { data: row, error } = await supabase
    .from("employees")
    .insert(employeeToRow(data, orgId))
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.employees(orgId), CacheKey.orgDirectory(orgId), CacheKey.tenantStats());
  const result = rowToEmployee(row as DbEmployee);
  void logAudit("employee.created", "employee", result.id, { firstName: data.firstName, lastName: data.lastName }, orgId);
  return result;
}

async function syncLinkedProfileName(
  userId: string | null,
  firstName: string,
  lastName: string,
): Promise<void> {
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function updateEmployee(emp: Employee, orgId: string, expectedVersion?: number): Promise<void> {
  const nextEmployee: Employee = {
    ...emp,
    firstName: emp.firstName.trim(),
    lastName: emp.lastName.trim(),
    phone: emp.phone.trim(),
    email: emp.email.trim(),
    contactNotes: emp.contactNotes.trim(),
  };
  let query = supabase
    .from("employees")
    .update(employeeToRow(nextEmployee, orgId))
    .eq("org_id", orgId)
    .eq("id", nextEmployee.id);
  if (expectedVersion !== undefined) {
    query = query.eq("version", expectedVersion);
  }
  const { error, count } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (expectedVersion !== undefined && count === 0) {
    throw new OptimisticLockError(nextEmployee.id, expectedVersion);
  }

  let syncError: unknown = null;
  if (nextEmployee.userId) {
    try {
      await syncLinkedProfileName(nextEmployee.userId, nextEmployee.firstName, nextEmployee.lastName);
    } catch (err) {
      syncError = err;
    }
  }
  await cacheDel(CacheKey.employees(orgId), CacheKey.employeeDetail(nextEmployee.id), CacheKey.orgDirectory(orgId));
  if (syncError) throw syncError;
  void logAudit("employee.updated", "employee", nextEmployee.id, { firstName: nextEmployee.firstName, lastName: nextEmployee.lastName }, orgId);
}

export async function updateEmployeeIdentity(
  input: {
    employeeId: string;
    orgId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    phone: string;
  },
): Promise<void> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();

  const { error } = await supabase
    .from("employees")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", input.orgId)
    .eq("id", input.employeeId);

  if (error) throw error;

  let syncError: unknown = null;
  if (input.userId) {
    try {
      await syncLinkedProfileName(input.userId, firstName, lastName);
    } catch (err) {
      syncError = err;
    }
  }

  await cacheDel(
    CacheKey.employees(input.orgId),
    CacheKey.employeeDetail(input.employeeId),
    CacheKey.orgDirectory(input.orgId),
  );
  if (syncError) throw syncError;

  void logAudit(
    "employee.updated",
    "employee",
    input.employeeId,
    { firstName, lastName },
    input.orgId,
  );
}

export async function updateEmployeeDepartments(
  employeeId: string,
  departmentIds: number[],
  orgId: string,
  deptAdminIds?: number[],
): Promise<void> {
  const deptSet = new Set(departmentIds);
  const updateData: Record<string, unknown> = { department_ids: departmentIds };
  // Always prune dept_admin_ids to remain a subset of department_ids
  if (deptAdminIds !== undefined) {
    updateData.dept_admin_ids = deptAdminIds.filter(id => deptSet.has(id));
  }
  const { error } = await supabase
    .from("employees")
    .update(updateData)
    .eq("org_id", orgId)
    .eq("id", employeeId);
  if (error) throw error;
  await cacheDel(CacheKey.employees(orgId), CacheKey.employeeDetail(employeeId), CacheKey.orgDirectory(orgId));
}

async function updateEmployeeStatus(
  input: {
    empId: string;
    orgId: string;
    action: "bench" | "activate" | "terminate";
    expectedVersion: number;
    note?: string;
  },
): Promise<Employee> {
  const response = await fetch("/api/employees/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await response.json().catch(() => null) as {
    error?: string;
    employee?: Employee;
  } | null;

  if (response.status === 409 && body?.employee) {
    throw new EmployeeStatusConflictError(body.employee);
  }

  if (!response.ok || !body?.employee) {
    throw new Error(body?.error || "Failed to update employee status");
  }

  await cacheDel(
    CacheKey.employeeDetail(input.empId),
    CacheKey.tenantStats(),
    CacheKey.employees(input.orgId),
    CacheKey.orgDirectory(input.orgId),
  );

  return body.employee;
}

export async function deleteEmployee(empId: string, orgId: string, expectedVersion: number): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "terminate",
    expectedVersion,
  });
}

export async function benchEmployee(empId: string, note: string | undefined, orgId: string, expectedVersion: number): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "bench",
    note,
    expectedVersion,
  });
}

export async function activateEmployee(empId: string, orgId: string, expectedVersion: number): Promise<Employee> {
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
  const payload = await response.json().catch(() => null) as { error?: string; employee?: Employee } | null;
  const mismatchError = parseNameMismatchResponse(payload);
  if (mismatchError) throw mismatchError;
  if (!response.ok || !payload?.employee) {
    throw new Error(payload?.error || "Failed to add management user to the schedule");
  }
  return payload.employee;
}

// ── Single Employee Fetch ──────────────────────────────────────────────────────

export async function fetchEmployeeById(
  empId: string,
  orgId: string,
): Promise<Employee | null> {
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
  shiftCodeMap: Map<number, string>,
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
  let query = supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, version, series_id, from_recurring, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, created_by, updated_by, created_at, updated_at")
    .eq("emp_id", empId);
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  query = query.order("date", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const atMap = absenceTypeMap ?? new Map<number, string>();
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    const entry = mapDbShiftRowToShiftEntry(row, {
      isScheduler: true,
      shiftCodeMap,
      absenceTypeMap: atMap,
    });
    if (entry) {
      map[`${row.emp_id}_${row.date}`] = entry;
    }
  }
  return map;
}

// ── Employee Role Change History ──────────────────────────────────────────────

export async function fetchEmployeeRoleHistory(
  userId: string,
): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase.rpc("get_audit_log", {
    p_org_id: null,
    p_limit: 50,
    p_offset: 0,
    p_target_user_id: userId,
  });
  if (error) throw error;
  return (data ?? [])
    .map((row: Record<string, unknown>) => ({
      id: row.id as string,
      targetUserId: row.target_user_id as string,
      targetEmail: (row.target_email as string | null) ?? null,
      changedById: row.changed_by_id as string,
      changedByEmail: (row.changed_by_email as string | null) ?? null,
      fromRole: row.from_role as string,
      toRole: row.to_role as string,
      createdAt: row.created_at as string,
      orgId: (row.org_id as string | null) ?? null,
      orgName: (row.org_name as string | null) ?? null,
    }));
}

// ── Employee Invitations ─────────────────────────────────────────────────────

export async function fetchEmployeeInvitations(
  orgId: string,
  employeeId: string,
): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: DbInvitation) => rowToInvitation(row));
}
