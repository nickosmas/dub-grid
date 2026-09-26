import type { DirectoryPerson, Employee } from "@/types";

export interface ManagementDirectoryUpdate {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  managementDepartmentIds: number[];
}

export function mergeEmployeeIntoDirectoryPerson(
  person: DirectoryPerson,
  employee: Employee,
): DirectoryPerson {
  const nextHasAppAccess = person.hasAppAccess || !!employee.userId;

  return {
    ...person,
    source: "employee",
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber ?? null,
    userId: employee.userId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email.trim() || person.email,
    phone: employee.phone.trim() || person.phone,
    employeeStatus: employee.status,
    hasAppAccess: nextHasAppAccess,
    focusAreaIds: employee.focusAreaIds,
    certificationId: employee.certificationId,
    roleIds: employee.roleIds,
    seniority: employee.seniority,
    scheduledDepartmentIds: employee.departmentIds,
    scheduledDeptAdminIds: employee.deptAdminIds,
    isManagementUser: nextHasAppAccess && person.managementDepartmentIds.length > 0,
  };
}

export function applyManagementDirectoryUpdate(
  person: DirectoryPerson,
  update: ManagementDirectoryUpdate,
): DirectoryPerson {
  const nextManagementDeptAdminIds = person.managementDeptAdminIds.filter((id) =>
    update.managementDepartmentIds.includes(id),
  );

  return {
    ...person,
    firstName: update.firstName,
    lastName: update.lastName,
    email: update.email,
    phone: update.phone,
    managementDepartmentIds: update.managementDepartmentIds,
    managementDeptAdminIds: nextManagementDeptAdminIds,
    departmentIds: update.managementDepartmentIds,
    deptAdminIds: nextManagementDeptAdminIds,
    isManagementUser: person.hasAppAccess && update.managementDepartmentIds.length > 0,
  };
}

export function upsertEmployeeInList(employees: Employee[], employee: Employee): Employee[] {
  const existingIndex = employees.findIndex((current) => current.id === employee.id);

  if (existingIndex === -1) {
    return [...employees, employee];
  }

  return employees.map((current) =>
    current.id === employee.id ? withKnownJoinedDate(current, employee) : current,
  );
}

/**
 * A single-employee response in place of the one it replaces. Those responses
 * may carry no joined date, so it keeps the one it had while the account link
 * is unchanged.
 */
export function withKnownJoinedDate(previous: Employee, next: Employee): Employee {
  if (next.joinedAt !== undefined) return next;
  const sameAccount = next.userId !== null && next.userId === previous.userId;
  return { ...next, joinedAt: sameAccount ? (previous.joinedAt ?? null) : null };
}
