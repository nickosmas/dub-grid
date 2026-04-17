import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/types";

const from = vi.fn();
const cacheDel = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/db/shared", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/shared")>("@/lib/db/shared");
  return {
    ...actual,
    supabase: {
      from: (table: string) => from(table),
    },
    cacheDel: (...args: unknown[]) => cacheDel(...args),
    logAudit: (...args: unknown[]) => logAudit(...args),
    CacheKey: {
      employees: (orgId: string) => `employees:${orgId}`,
      employeeDetail: (employeeId: string) => `employee:${employeeId}`,
      orgDirectory: (orgId: string) => `org-directory:${orgId}`,
    },
  };
});

import { updateEmployee, updateEmployeeIdentity } from "@/lib/db/employees";

function makeEmployeeUpdateBuilder() {
  const result = { error: null, count: 1 };
  const selectChain = {
    maybeSingle: vi.fn(() => result),
  };
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => selectChain),
  };

  return {
    update: vi.fn(() => chain),
  };
}

function makeProfileUpdateBuilder() {
  const chain = {
    error: null,
    eq: vi.fn(() => chain),
  };

  return {
    update: vi.fn(() => chain),
  };
}

describe("linked employee name syncing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the linked profile name when saving an employee", async () => {
    const employeesBuilder = makeEmployeeUpdateBuilder();
    const profilesBuilder = makeProfileUpdateBuilder();

    from
      .mockImplementationOnce(() => employeesBuilder)
      .mockImplementationOnce(() => profilesBuilder);

    const employee: Employee = {
      id: "emp-1",
      firstName: " Alice ",
      lastName: " Smith ",
      status: "active",
      statusChangedAt: null,
      statusNote: "",
      certificationId: null,
      roleIds: [],
      seniority: 1,
      focusAreaIds: [1],
      phone: " 555-0100 ",
      email: " alice@example.com ",
      contactNotes: " note ",
      userId: "user-1",
      departmentIds: [],
      deptAdminIds: [],
      version: 3,
    };

    await updateEmployee(employee, "org-1");

    expect(employeesBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Alice",
      last_name: "Smith",
    }));
    expect(profilesBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Alice",
      last_name: "Smith",
    }));
    expect(cacheDel).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalled();
  });

  it("updates both employee and profile names from the management panel helper", async () => {
    const employeesBuilder = makeProfileUpdateBuilder();
    const profilesBuilder = makeProfileUpdateBuilder();

    from
      .mockImplementationOnce(() => employeesBuilder)
      .mockImplementationOnce(() => profilesBuilder);

    await updateEmployeeIdentity({
      employeeId: "emp-1",
      orgId: "org-1",
      userId: "user-1",
      firstName: "Alicia",
      lastName: "Stone",
      phone: "555-0199",
    });

    expect(employeesBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Alicia",
      last_name: "Stone",
      phone: "555-0199",
    }));
    expect(profilesBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Alicia",
      last_name: "Stone",
    }));
    expect(cacheDel).toHaveBeenCalled();
  });
});
