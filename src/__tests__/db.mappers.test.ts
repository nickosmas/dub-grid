import { describe, it, expect } from "vitest";
import { rowToOrganization, rowToFocusArea, rowToShiftCode } from "@/lib/db";
import type { DbOrganization, DbFocusArea, DbShiftCode } from "@/lib/db";

// ── rowToOrganization ──────────────────────────────────────────────────────────

describe("rowToOrganization", () => {
  it("maps all fields correctly with camelCase conversion", () => {
    const row: DbOrganization = {
      id: "org-123",
      name: "Sunrise Care",
      address: "123 Main St",
      phone: "555-1234",
      employee_count: 42,
      slug: null,
      focus_area_label: null,
      certification_label: null,
      role_label: null,
      timezone: null,
      archived_at: null,
    };

    const result = rowToOrganization(row);

    expect(result.id).toBe("org-123");
    expect(result.name).toBe("Sunrise Care");
    expect(result.address).toBe("123 Main St");
    expect(result.phone).toBe("555-1234");
    expect(result.employeeCount).toBe(42);
  });

  it("maps employee_count: null to employeeCount: null", () => {
    const row: DbOrganization = {
      id: "org-456",
      name: "Sunset Clinic",
      address: "456 Oak Ave",
      phone: "555-5678",
      employee_count: null,
      slug: null,
      focus_area_label: null,
      certification_label: null,
      role_label: null,
      timezone: null,
      archived_at: null,
    };

    const result = rowToOrganization(row);

    expect(result.employeeCount).toBeNull();
  });
});

// ── rowToFocusArea ──────────────────────────────────────────────────────────

describe("rowToFocusArea", () => {
  it("maps all fields correctly with camelCase conversion", () => {
    const row: DbFocusArea = {
      id: 7,
      org_id: "org-abc",
      name: "East Section",
      color_bg: "#ff0000",
      color_text: "#ffffff",
      sort_order: 3,
      archived_at: null,
    };

    const result = rowToFocusArea(row);

    expect(result.id).toBe(7);
    expect(result.orgId).toBe("org-abc");
    expect(result.name).toBe("East Section");
    expect(result.colorBg).toBe("#ff0000");
    expect(result.colorText).toBe("#ffffff");
    expect(result.sortOrder).toBe(3);
    expect(result.archivedAt).toBeNull();
  });

  it("maps archived_at timestamp to archivedAt", () => {
    const row: DbFocusArea = {
      id: 8,
      org_id: "org-abc",
      name: "Archived Section",
      color_bg: "#ccc",
      color_text: "#000",
      sort_order: 4,
      archived_at: "2026-03-10T12:00:00Z",
    };

    const result = rowToFocusArea(row);
    expect(result.archivedAt).toBe("2026-03-10T12:00:00Z");
  });
});

// ── rowToShiftCode ────────────────────────────────────────────────────────────

const baseShiftCodeRow: DbShiftCode = {
  id: 1,
  org_id: "org-1",
  label: "D",
  name: "Day",
  color: "#fff",
  border_color: "#000",
  text_color: "#333",
  category_id: null,
  is_general: false,
  is_off_day: false,
  focus_area_id: null,
  sort_order: 0,
  required_certification_ids: [],
  default_start_time: null,
  default_end_time: null,
  archived_at: null,
};

describe("rowToShiftCode", () => {
  it("category_id: null maps to categoryId: null", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, category_id: null });
    expect(result.categoryId).toBeNull();
  });

  it("category_id: 5 maps to categoryId: 5", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, category_id: 5 });
    expect(result.categoryId).toBe(5);
  });

  it("is_general: false maps to isGeneral: undefined", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, is_general: false });
    expect(result.isGeneral).toBeUndefined();
  });

  it("is_general: true maps to isGeneral: true", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, is_general: true });
    expect(result.isGeneral).toBe(true);
  });

  it("focus_area_id: null maps to focusAreaId: null", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, focus_area_id: null });
    expect(result.focusAreaId).toBeNull();
  });

  it("focus_area_id: 7 maps to focusAreaId: 7", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, focus_area_id: 7 });
    expect(result.focusAreaId).toBe(7);
  });

  it("archived_at: null maps to archivedAt: null", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, archived_at: null });
    expect(result.archivedAt).toBeNull();
  });

  it("archived_at: timestamp maps to archivedAt: string", () => {
    const result = rowToShiftCode({ ...baseShiftCodeRow, archived_at: "2026-03-10T12:00:00Z" });
    expect(result.archivedAt).toBe("2026-03-10T12:00:00Z");
  });
});

// ── Property 9: rowToShiftCode field mapping ──────────────────────────────────

import * as fc from "fast-check";

// Feature: comprehensive-test-suite, Property 9: rowToShiftCode field mapping
describe("rowToShiftCode — Property 9: field mapping correctness", () => {
  const arbDbShiftCode = fc.record({
    id: fc.integer({ min: 1 }),
    org_id: fc.string({ minLength: 1 }),
    label: fc.string({ minLength: 1 }),
    name: fc.string({ minLength: 1 }),
    color: fc.string(),
    border_color: fc.string(),
    text_color: fc.string(),
    category_id: fc.option(fc.integer({ min: 1 }), { nil: null }),
    is_general: fc.boolean(),
    is_off_day: fc.boolean(),
    focus_area_id: fc.option(fc.integer({ min: 1 }), { nil: null }),
    sort_order: fc.integer({ min: 0 }),
    required_certification_ids: fc.array(fc.integer({ min: 1 })),
    default_start_time: fc.option(fc.string(), { nil: null }),
    default_end_time: fc.option(fc.string(), { nil: null }),
    archived_at: fc.option(fc.string(), { nil: null }),
  });

  it("category_id passes through correctly; is_general maps to undefined/true", () => {
    fc.assert(
      fc.property(arbDbShiftCode, (row) => {
        const result = rowToShiftCode(row);

        // categoryId round-trips
        expect(result.categoryId).toBe(row.category_id ?? null);

        // is_general: false → undefined; true → true
        if (row.is_general === false) {
          expect(result.isGeneral).toBeUndefined();
        } else {
          expect(result.isGeneral).toBe(true);
        }

        // focus_area_id passes through as-is
        expect(result.focusAreaId).toBe(row.focus_area_id ?? null);
      }),
    );
  });
});

// ── rowToEmployee ─────────────────────────────────────────────────────────────

import { rowToEmployee } from "@/lib/db";
import type { DbEmployee } from "@/lib/db";

const baseEmployeeRow: DbEmployee = {
  id: "emp-1",
  org_id: "org-1",
  first_name: "Alice",
  last_name: "Smith",
  status: "active",
  status_changed_at: null,
  status_note: "",
  certification_id: 1,
  role_ids: [2, 3],
  seniority: 3,
  focus_area_ids: [1, 2],
  phone: "555-9999",
  email: "alice@example.com",
  contact_notes: "Call after 9am",
  user_id: null,
  archived_at: null,
};

describe("rowToEmployee", () => {
  it("maps all fields correctly", () => {
    const result = rowToEmployee(baseEmployeeRow);

    expect(result.id).toBe("emp-1");
    expect(result.firstName).toBe("Alice");
    expect(result.lastName).toBe("Smith");
    expect(result.certificationId).toBe(1);
    expect(result.roleIds).toEqual([2, 3]);
    expect(result.seniority).toBe(3);
    expect(result.focusAreaIds).toEqual([1, 2]);
    expect(result.phone).toBe("555-9999");
    expect(result.email).toBe("alice@example.com");
    expect(result.contactNotes).toBe("Call after 9am");
  });

  it("phone: null defaults to empty string", () => {
    const row = { ...baseEmployeeRow, phone: null } as any;
    const result = rowToEmployee(row);
    expect(result.phone).toBe("");
  });

  it("email: null defaults to empty string", () => {
    const row = { ...baseEmployeeRow, email: null } as any;
    const result = rowToEmployee(row);
    expect(result.email).toBe("");
  });

  it("contact_notes: null defaults to empty string", () => {
    const row = { ...baseEmployeeRow, contact_notes: null } as any;
    const result = rowToEmployee(row);
    expect(result.contactNotes).toBe("");
  });
});

// ── employeeToRow ─────────────────────────────────────────────────────────────

import { employeeToRow } from "@/lib/db";
import type { Employee } from "@/types";

describe("employeeToRow", () => {
  const baseEmployee: Omit<Employee, "id"> = {
    firstName: "Bob",
    lastName: "Jones",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 2,
    roleIds: [1],
    seniority: 2,
    focusAreaIds: [1],
    phone: "555-1111",
    email: "bob@example.com",
    contactNotes: "Prefers text",
    userId: null,
  };

  it("maps all fields correctly to snake_case", () => {
    const result = employeeToRow(baseEmployee, "org-99");

    expect(result.org_id).toBe("org-99");
    expect(result.first_name).toBe("Bob");
    expect(result.last_name).toBe("Jones");
    expect(result.certification_id).toBe(2);
    expect(result.role_ids).toEqual([1]);
    expect(result.seniority).toBe(2);
    expect(result.focus_area_ids).toEqual([1]);
    expect(result.phone).toBe("555-1111");
    expect(result.email).toBe("bob@example.com");
    expect(result.contact_notes).toBe("Prefers text");
  });

  it("uses the provided orgId as org_id", () => {
    const result = employeeToRow(baseEmployee, "org-abc");
    expect(result.org_id).toBe("org-abc");
  });

  it("does not include id in the output", () => {
    const result = employeeToRow(baseEmployee, "org-1");
    expect("id" in result).toBe(false);
  });
});

// ── Property 8: Employee mapper round-trip ────────────────────────────────────

// Feature: comprehensive-test-suite, Property 8: Employee mapper round-trip
describe("rowToEmployee / employeeToRow — Property 8: round-trip", () => {
  const arbDbEmployee = fc.record({
    id: fc.uuid(),
    org_id: fc.string({ minLength: 1 }),
    first_name: fc.string({ minLength: 1 }),
    last_name: fc.string({ minLength: 1 }),
    status: fc.constantFrom("active" as const, "benched" as const, "terminated" as const),
    status_changed_at: fc.oneof(fc.constant(null as string | null), fc.constant("2026-01-01T00:00:00Z")),
    status_note: fc.string(),
    certification_id: fc.oneof(fc.constant(null as number | null), fc.integer({ min: 1 })),
    role_ids: fc.array(fc.integer({ min: 1 })),
    seniority: fc.integer({ min: 1 }),
    focus_area_ids: fc.array(fc.integer({ min: 1 })),
    phone: fc.string(),
    email: fc.string(),
    contact_notes: fc.string(),
    user_id: fc.constant(null as string | null),
    archived_at: fc.constant(null as string | null),
  });

  it("rowToEmployee(employeeToRow(rowToEmployee(row))) equals rowToEmployee(row)", () => {
    // Validates: Requirements 6.7
    // employeeToRow intentionally excludes status/archived fields (managed by dedicated functions),
    // so we add them back from the original row for the round-trip comparison.
    fc.assert(
      fc.property(arbDbEmployee, (row) => {
        const employee1 = rowToEmployee(row);
        const reconstructedRow = {
          ...employeeToRow(employee1, row.org_id),
          id: row.id,
          status: row.status,
          status_changed_at: row.status_changed_at,
          status_note: row.status_note,
          archived_at: row.archived_at,
        };
        const employee2 = rowToEmployee(reconstructedRow as DbEmployee);
        expect(employee2).toEqual(employee1);
      }),
    );
  });
});
