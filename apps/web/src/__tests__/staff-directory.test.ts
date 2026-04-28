import { describe, expect, it } from "vitest";
import type { DirectoryPerson, Employee } from "@/types";
import {
  applyManagementDirectoryUpdate,
  mergeEmployeeIntoDirectoryPerson,
  upsertEmployeeInList,
} from "@/lib/staff-directory";

const baseDirectoryPerson: DirectoryPerson = {
  personId: "u:user-1",
  source: "user_only",
  employeeId: null,
  userId: "user-1",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  phone: "555-0100",
  employeeStatus: null,
  orgRole: "user",
  hasAppAccess: true,
  focusAreaIds: [],
  certificationId: null,
  roleIds: [],
  seniority: null,
  lastSignInAt: null,
  invitationStatus: null,
  scheduledDepartmentIds: [],
  scheduledDeptAdminIds: [],
  managementDepartmentIds: [10, 20],
  managementDeptAdminIds: [20],
  departmentIds: [10, 20],
  deptAdminIds: [20],
  isManagementUser: true,
};

const baseEmployee: Employee = {
  id: "emp-1",
  firstName: "Alicia",
  lastName: "Stone",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: 4,
  roleIds: [2],
  seniority: 7,
  focusAreaIds: [1, 2],
  phone: "",
  email: "",
  contactNotes: "",
  userId: "user-1",
  departmentIds: [30],
  deptAdminIds: [30],
  version: 1,
};

describe("staff directory cache helpers", () => {
  it("merges a created or linked employee onto a directory person without losing fallback contact info", () => {
    expect(mergeEmployeeIntoDirectoryPerson(baseDirectoryPerson, baseEmployee)).toEqual({
      ...baseDirectoryPerson,
      source: "employee",
      employeeId: "emp-1",
      userId: "user-1",
      firstName: "Alicia",
      lastName: "Stone",
      email: "alice@example.com",
      phone: "555-0100",
      employeeStatus: "active",
      focusAreaIds: [1, 2],
      certificationId: 4,
      roleIds: [2],
      seniority: 7,
      scheduledDepartmentIds: [30],
      scheduledDeptAdminIds: [30],
      isManagementUser: true,
    });
  });

  it("applies management-panel edits and keeps alias/admin department fields aligned", () => {
    expect(applyManagementDirectoryUpdate(baseDirectoryPerson, {
      firstName: "Allie",
      lastName: "Stone",
      phone: "555-0199",
      managementDepartmentIds: [10],
    })).toEqual({
      ...baseDirectoryPerson,
      firstName: "Allie",
      lastName: "Stone",
      phone: "555-0199",
      managementDepartmentIds: [10],
      managementDeptAdminIds: [],
      departmentIds: [10],
      deptAdminIds: [],
      isManagementUser: true,
    });
  });

  it("upserts employees into the live employee list cache", () => {
    const otherEmployee: Employee = {
      ...baseEmployee,
      id: "emp-2",
      firstName: "Bob",
      lastName: "Jones",
      userId: null,
    };

    expect(upsertEmployeeInList([otherEmployee], baseEmployee)).toEqual([otherEmployee, baseEmployee]);
    expect(upsertEmployeeInList([otherEmployee, baseEmployee], {
      ...baseEmployee,
      firstName: "Alice",
    })[1].firstName).toBe("Alice");
  });
});
