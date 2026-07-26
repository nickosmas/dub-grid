"use client";

import { parseNameMismatchResponse } from "@/lib/account-linking";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { SELF_ACTION_FORBIDDEN_CODE, SelfActionForbiddenError } from "@dubgrid/domain";
import type { AuditLogEntry, Employee, EmployeeStatus, Invitation, ShiftMap } from "@/types";

export interface UpdateEmployeeIdentityInput {
  employeeId: string;
  orgId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  /** Optional. Omit to leave the existing email untouched. */
  email?: string;
  /** Optimistic-lock token; pass the version the editor was viewing. */
  expectedVersion: number;
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly shiftId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number,
  ) {
    super(
      `Optimistic lock failed for shift ${shiftId}: expected version ${expectedVersion}${actualVersion !== undefined ? `, but found version ${actualVersion}` : ""}`,
    );
    this.name = "OptimisticLockError";
  }
}

export class EmployeeStatusConflictError extends Error {
  constructor(public readonly latestEmployee: Employee) {
    super("Employee status changed elsewhere.");
    this.name = "EmployeeStatusConflictError";
  }
}

export class EmployeeContactConflictError extends Error {
  constructor(
    message: string,
    public readonly field: "email" | "phone",
  ) {
    super(message);
    this.name = "EmployeeContactConflictError";
  }
}

/** The server refused the read outright (403) — e.g. a management user's
 * profile requested by a viewer without staff-manager rights. Callers can
 * redirect instead of rendering a dead-end error state. */
export class EmployeeAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeAccessDeniedError";
  }
}

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestEmployeesJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
    employee?: Employee;
    field?: "email" | "phone";
    message?: string;
    status?: string;
  } | null;
  const mismatchError = parseNameMismatchResponse(payload);
  if (mismatchError) {
    throw mismatchError;
  }
  if (
    payload?.code === "EMPLOYEE_CONTACT_CONFLICT" &&
    (payload.field === "email" || payload.field === "phone")
  ) {
    throw new EmployeeContactConflictError(
      payload.message ?? payload.error ?? "Contact details are already in use.",
      payload.field,
    );
  }
  if (response.status === 403) {
    throw new EmployeeAccessDeniedError(
      formatClientErrorMessage(payload?.error, "You don't have permission to do that."),
    );
  }
  if (!response.ok) {
    throw new Error(formatClientErrorMessage(payload?.error, "Employee request failed."));
  }

  return payload as T;
}

async function requestEmployeeAction<T>(body: Record<string, unknown>): Promise<T> {
  return requestEmployeesJson<T>("/api/employees/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateEmployeeIdentity(
  input: UpdateEmployeeIdentityInput,
): Promise<{ success: true; employee: Employee }> {
  return requestEmployeesJson<{ success: true; employee: Employee }>("/api/employees/identity", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchEmployees(orgId: string, statuses?: EmployeeStatus[]): Promise<Employee[]> {
  return requestEmployeeAction<{ employees: Employee[] }>({
    action: "fetchEmployees",
    orgId,
    statuses,
  }).then((data) => data.employees);
}

export function insertEmployee(employee: Omit<Employee, "id">, orgId: string): Promise<Employee> {
  return requestEmployeeAction<{ employee: Employee }>({
    action: "insertEmployee",
    orgId,
    employee,
  }).then((data) => data.employee);
}

export async function updateEmployee(
  employee: Employee,
  orgId: string,
  expectedVersion?: number,
): Promise<void> {
  const response = await fetch(resolveClientUrl("/api/employees/manage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updateEmployee",
      orgId,
      employee,
      expectedVersion,
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
    employee?: Employee;
    field?: "email" | "phone";
    message?: string;
  } | null;

  if (
    response.status === 409 &&
    body?.code === "EMPLOYEE_CONTACT_CONFLICT" &&
    (body.field === "email" || body.field === "phone")
  ) {
    throw new EmployeeContactConflictError(
      body.message ?? body.error ?? "Contact details are already in use.",
      body.field,
    );
  }

  if (response.status === 409) {
    throw new OptimisticLockError(
      employee.id,
      expectedVersion ?? employee.version,
      body?.employee?.version,
    );
  }

  if (!response.ok) {
    throw new Error(formatClientErrorMessage(body?.error, "Failed to update employee"));
  }
}

export function fetchEmployeeById(employeeId: string, orgId: string): Promise<Employee | null> {
  return requestEmployeeAction<{ employee: Employee | null }>({
    action: "fetchEmployeeById",
    orgId,
    employeeId,
  }).then((data) => data.employee);
}

export function fetchEmployeeByUserId(userId: string, orgId: string): Promise<Employee | null> {
  return requestEmployeeAction<{ employee: Employee | null }>({
    action: "fetchEmployeeByUserId",
    orgId,
    userId,
  }).then((data) => data.employee);
}

export function fetchEmployeeShifts(
  employeeId: string,
  orgId: string,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Promise<ShiftMap> {
  return requestEmployeeAction<{ shifts: ShiftMap }>({
    action: "fetchEmployeeShifts",
    orgId,
    employeeId,
    assignmentLabels: [...assignmentLabelMap.entries()],
    absenceTypeLabels: absenceTypeMap ? [...absenceTypeMap.entries()] : undefined,
    startDate,
    endDate,
  }).then((data) => data.shifts);
}

export function fetchEmployeeInvitations(orgId: string, employeeId: string): Promise<Invitation[]> {
  return requestEmployeeAction<{ invitations: Invitation[] }>({
    action: "fetchEmployeeInvitations",
    orgId,
    employeeId,
  }).then((data) => data.invitations);
}

export function fetchEmployeeRoleHistory(userId: string, orgId: string): Promise<AuditLogEntry[]> {
  return requestEmployeeAction<{ entries: AuditLogEntry[] }>({
    action: "fetchEmployeeRoleHistory",
    orgId,
    userId,
  }).then((data) => data.entries);
}

async function updateEmployeeStatus(input: {
  empId: string;
  orgId: string;
  action: "deactivate" | "activate" | "remove";
  expectedVersion: number;
  note?: string;
}): Promise<Employee> {
  const response = await fetch(resolveClientUrl("/api/employees/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    employee?: Employee;
  } | null;

  if (response.status === 409 && body?.employee) {
    throw new EmployeeStatusConflictError(body.employee);
  }

  if (body?.code === SELF_ACTION_FORBIDDEN_CODE) {
    throw new SelfActionForbiddenError(body.error);
  }

  if (!response.ok || !body?.employee) {
    throw new Error(formatClientErrorMessage(body?.error, "Failed to update employee status"));
  }

  return body.employee;
}

export function removeEmployee(
  empId: string,
  orgId: string,
  expectedVersion: number,
  note?: string,
): Promise<Employee> {
  return updateEmployeeStatus({
    empId,
    orgId,
    action: "remove",
    expectedVersion,
    note,
  });
}

export function deactivateEmployee(
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

export function activateEmployee(
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
