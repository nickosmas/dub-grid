import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateSelfProfilePhone } from "@/features/account/client/api";
import { EmployeeProfileConflictError } from "@/features/employees/client";
import type { Employee } from "@/types";

const employee = {
  id: "employee-1",
  version: 4,
  phone: "(555) 555-0101",
} as Employee;

describe("updateSelfProfilePhone", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the authoritative updated employee", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ employee }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      updateSelfProfilePhone({ orgId: "org-1", phone: employee.phone, expectedVersion: 3 }),
    ).resolves.toEqual({ employee });
  });

  it("throws the shared typed conflict with the latest employee", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "EMPLOYEE_CONFLICT", employee }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const error = await updateSelfProfilePhone({
      orgId: "org-1",
      phone: employee.phone,
      expectedVersion: 3,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmployeeProfileConflictError);
    expect((error as EmployeeProfileConflictError).latestEmployee).toEqual(employee);
  });
});
