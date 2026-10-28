import { afterEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/types";
import { changeEmployeeStatuses, EmployeeProfileConflictError, updateEmployee } from "./api";

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

describe("changeEmployeeStatuses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one request and returns each person's outcome", async () => {
    const results = [
      { empId: "emp-1", ok: true, employee },
      { empId: "emp-2", ok: false, error: "Already Away." },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      changeEmployeeStatuses(
        {
          orgId: "org-1",
          action: "markAway",
          people: [{ empId: "emp-1", expectedVersion: 3 }],
          returnDate: "2027-01-04",
        },
        "token",
      ),
    ).resolves.toEqual(results);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/employees/status/bulk");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(JSON.parse(init.body as string)).toEqual({
      orgId: "org-1",
      action: "markAway",
      people: [{ empId: "emp-1", expectedVersion: 3 }],
      returnDate: "2027-01-04",
    });
  });

  it("throws a refused request with what step-up needs to recognize it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Confirm it's you.",
          code: "STEP_UP_REQUIRED",
          method: "totp",
        }),
      }),
    );
    await expect(
      changeEmployeeStatuses({
        orgId: "org-1",
        action: "archive",
        people: [{ empId: "emp-1", expectedVersion: 3 }],
      }),
    ).rejects.toMatchObject({ status: 401, code: "STEP_UP_REQUIRED", method: "totp" });
  });
});
