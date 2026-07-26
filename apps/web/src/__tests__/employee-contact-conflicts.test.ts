import { describe, expect, it } from "vitest";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";

describe("getEmployeeContactConflict", () => {
  it("maps active employee email uniqueness violations", () => {
    expect(
      getEmployeeContactConflict({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "unique_active_employee_email_per_org"',
      }),
    ).toEqual({
      code: "EMPLOYEE_CONTACT_CONFLICT",
      error: "That email is already used by another person.",
      field: "email",
      message: "That email is already used by another person.",
    });
  });

  it("maps active employee phone uniqueness violations", () => {
    expect(
      getEmployeeContactConflict({
        code: "23505",
        constraint: "unique_active_employee_phone_per_org",
      }),
    ).toEqual({
      code: "EMPLOYEE_CONTACT_CONFLICT",
      error: "That phone number is already used by another person.",
      field: "phone",
      message: "That phone number is already used by another person.",
    });
  });

  it("maps active employee name uniqueness violations", () => {
    expect(
      getEmployeeContactConflict({
        code: "23505",
        constraint: "employees_org_name_active_unique",
      }),
    ).toEqual({
      code: "EMPLOYEE_CONTACT_CONFLICT",
      error: "An employee with that name already exists.",
      field: "name",
      message: "An employee with that name already exists.",
    });
  });

  it("ignores unrelated database errors", () => {
    expect(
      getEmployeeContactConflict({
        code: "23505",
        constraint: "some_other_unique_index",
      }),
    ).toBeNull();
  });
});
