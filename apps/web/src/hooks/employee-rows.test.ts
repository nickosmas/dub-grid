import { describe, expect, it } from "vitest";
import type { Employee } from "@/types";
import { replaceEmployeeRow } from "./employee-rows";

function employee(overrides: Partial<Employee>): Employee {
  return {
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
    focusAreaIds: [],
    phone: "",
    email: "mina@example.com",
    contactNotes: "",
    userId: "user-1",
    departmentIds: [],
    deptAdminIds: [],
    version: 1,
    ...overrides,
  };
}

const JOINED = "2026-03-05T14:00:00.000Z";

describe("replaceEmployeeRow", () => {
  it("keeps the joined date a saved row's response does not carry", () => {
    const rows = [employee({ joinedAt: JOINED }), employee({ id: "emp-2", joinedAt: null })];

    const [saved, untouched] = replaceEmployeeRow(
      rows,
      employee({ firstName: "Mira", version: 2 }),
    );

    expect(saved).toMatchObject({ firstName: "Mira", version: 2, joinedAt: JOINED });
    expect(untouched).toBe(rows[1]);
  });

  it("drops the date when the account link changed", () => {
    const rows = [employee({ joinedAt: JOINED })];

    const [unlinked] = replaceEmployeeRow(rows, employee({ userId: null }));
    const [relinked] = replaceEmployeeRow(rows, employee({ userId: "user-2" }));

    expect(unlinked.joinedAt).toBeNull();
    expect(relinked.joinedAt).toBeNull();
  });

  it("uses a date the response carries as it is", () => {
    const rows = [employee({ joinedAt: JOINED })];
    const later = "2026-04-01T00:00:00.000Z";

    expect(replaceEmployeeRow(rows, employee({ joinedAt: later }))[0].joinedAt).toBe(later);
    expect(replaceEmployeeRow(rows, employee({ joinedAt: null }))[0].joinedAt).toBeNull();
  });
});
