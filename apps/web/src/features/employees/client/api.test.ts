import { afterEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/types";
import { EmployeeProfileConflictError, updateEmployee } from "./api";

const employee: Employee = {
  id: "emp-1",
  employeeNumber: 1,
  firstName: "Mina",
  lastName: "Diaz",
  employmentType: "full_time",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: null,
  roleIds: [],
  seniority: 1,
  focusAreaIds: [2],
  phone: "",
  email: "mina@example.com",
  contactNotes: "",
  userId: null,
  departmentIds: [],
  deptAdminIds: [],
  version: 3,
  createdAt: null,
};

describe("updateEmployee", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the authoritative employee from the server", async () => {
    const savedEmployee = { ...employee, firstName: "Minerva", version: 4 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ employee: savedEmployee }),
      }),
    );

    await expect(
      updateEmployee({ ...employee, firstName: "Minerva" }, "org-1", 3),
    ).resolves.toEqual(savedEmployee);
  });

  it("exposes the latest employee on a profile conflict", async () => {
    const latestEmployee = { ...employee, firstName: "Elsewhere", version: 5 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "EMPLOYEE_CONFLICT", employee: latestEmployee }),
      }),
    );

    const error = await updateEmployee(employee, "org-1", 3).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmployeeProfileConflictError);
    expect(error.latestEmployee).toEqual(latestEmployee);
  });
});
