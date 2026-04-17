import type { DirectoryPerson, Employee } from "@/types";

export interface ManagementDirectoryUpdate {
  firstName: string;
  lastName: string;
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
    phone: update.phone,
    managementDepartmentIds: update.managementDepartmentIds,
    managementDeptAdminIds: nextManagementDeptAdminIds,
    departmentIds: update.managementDepartmentIds,
    deptAdminIds: nextManagementDeptAdminIds,
    isManagementUser: person.hasAppAccess && update.managementDepartmentIds.length > 0,
  };
}

export function upsertEmployeeInList(
  employees: Employee[],
  employee: Employee,
): Employee[] {
  const existingIndex = employees.findIndex((current) => current.id === employee.id);

  if (existingIndex === -1) {
    return [...employees, employee];
  }

  return employees.map((current) => (current.id === employee.id ? employee : current));
}
