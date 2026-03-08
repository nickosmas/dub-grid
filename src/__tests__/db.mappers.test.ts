import { describe, it, expect } from "vitest";
import { rowToOrg, rowToWing, rowToShiftType } from "@/lib/db";
import type { DbOrganization, DbWing, DbShiftType } from "@/lib/db";

// ── rowToOrg ──────────────────────────────────────────────────────────────────

describe("rowToOrg", () => {
  it("maps all fields correctly with camelCase conversion", () => {
    const row: DbOrganization = {
      id: "org-123",
      name: "Sunrise Care",
      address: "123 Main St",
      phone: "555-1234",
      employee_count: 42,
      slug: null,
      skill_levels: ["JLCSN", "CSN III", "CSN II", "STAFF", "—"],
      roles: ["DCSN", "Supv"],
    };

    const result = rowToOrg(row);

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
      skill_levels: [],
      roles: [],
    };

    const result = rowToOrg(row);

    expect(result.employeeCount).toBeNull();
  });
});

// ── rowToWing ─────────────────────────────────────────────────────────────────

describe("rowToWing", () => {
  it("maps all fields correctly with camelCase conversion", () => {
    const row: DbWing = {
      id: 7,
      org_id: "org-abc",
      name: "East Wing",
      color_bg: "#ff0000",
      color_text: "#ffffff",
      sort_order: 3,
    };

    const result = rowToWing(row);

    expect(result.id).toBe(7);
    expect(result.orgId).toBe("org-abc");
    expect(result.name).toBe("East Wing");
    expect(result.colorBg).toBe("#ff0000");
    expect(result.colorText).toBe("#ffffff");
    expect(result.sortOrder).toBe(3);
  });
});

// ── rowToShiftType ────────────────────────────────────────────────────────────

const baseShiftTypeRow: DbShiftType = {
  id: 1,
  org_id: "org-1",
  label: "D",
  name: "Day",
  color: "#fff",
  border_color: "#000",
  text_color: "#333",
  counts_toward_day: false,
  counts_toward_eve: false,
  counts_toward_night: false,
  is_orientation: false,
  is_general: false,
  wing_name: null,
  sort_order: 0,
  required_designations: [],
};

describe("rowToShiftType", () => {
  it("all boolean flags false → all optional fields are undefined", () => {
    const result = rowToShiftType({
      ...baseShiftTypeRow,
      counts_toward_day: false,
      counts_toward_eve: false,
      counts_toward_night: false,
      is_orientation: false,
      is_general: false,
    });

    expect(result.countsTowardDay).toBeUndefined();
    expect(result.countsTowardEve).toBeUndefined();
    expect(result.countsTowardNight).toBeUndefined();
    expect(result.isOrientation).toBeUndefined();
    expect(result.isGeneral).toBeUndefined();
  });

  it("all boolean flags true → all optional fields are true", () => {
    const result = rowToShiftType({
      ...baseShiftTypeRow,
      counts_toward_day: true,
      counts_toward_eve: true,
      counts_toward_night: true,
      is_orientation: true,
      is_general: true,
    });

    expect(result.countsTowardDay).toBe(true);
    expect(result.countsTowardEve).toBe(true);
    expect(result.countsTowardNight).toBe(true);
    expect(result.isOrientation).toBe(true);
    expect(result.isGeneral).toBe(true);
  });

  it("wing_name: null maps to wingName: null", () => {
    const result = rowToShiftType({ ...baseShiftTypeRow, wing_name: null });

    expect(result.wingName).toBeNull();
  });
});

// ── Property 9: rowToShiftType boolean-to-undefined coercion ─────────────────

import * as fc from "fast-check";

// Feature: comprehensive-test-suite, Property 9: rowToShiftType boolean-to-undefined coercion
describe("rowToShiftType — Property 9: boolean-to-undefined coercion", () => {
  const arbDbShiftType = fc.record({
    id: fc.integer({ min: 1 }),
    org_id: fc.string({ minLength: 1 }),
    label: fc.string({ minLength: 1 }),
    name: fc.string({ minLength: 1 }),
    color: fc.string(),
    border_color: fc.string(),
    text_color: fc.string(),
    counts_toward_day: fc.boolean(),
    counts_toward_eve: fc.boolean(),
    counts_toward_night: fc.boolean(),
    is_orientation: fc.boolean(),
    is_general: fc.boolean(),
    wing_name: fc.option(fc.string(), { nil: null }),
    sort_order: fc.integer({ min: 0 }),
    required_designations: fc.array(fc.constantFrom("JLCSN", "CSN III", "CSN II", "STAFF")),
  });

  it("each boolean flag maps to undefined when false, true when true", () => {
    // Validates: Requirements 6.3, 6.4
    fc.assert(
      fc.property(arbDbShiftType, (row) => {
        const result = rowToShiftType(row);

        const flags = [
          { flag: row.counts_toward_day, field: result.countsTowardDay },
          { flag: row.counts_toward_eve, field: result.countsTowardEve },
          { flag: row.counts_toward_night, field: result.countsTowardNight },
          { flag: row.is_orientation, field: result.isOrientation },
          { flag: row.is_general, field: result.isGeneral },
        ] as const;

        for (const { flag, field } of flags) {
          if (flag === false) {
            expect(field).toBeUndefined();
          } else {
            expect(field).toBe(true);
          }
        }
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
  name: "Alice Smith",
  designation: "RN",
  roles: ["nurse", "charge"],
  fte_weight: 1.0,
  seniority: 3,
  wings: ["East", "West"],
  phone: "555-9999",
  email: "alice@example.com",
  contact_notes: "Call after 9am",
};

describe("rowToEmployee", () => {
  it("maps all fields correctly", () => {
    const result = rowToEmployee(baseEmployeeRow);

    expect(result.id).toBe("emp-1");
    expect(result.name).toBe("Alice Smith");
    expect(result.designation).toBe("RN");
    expect(result.roles).toEqual(["nurse", "charge"]);
    expect(result.fteWeight).toBe(1.0);
    expect(result.seniority).toBe(3);
    expect(result.wings).toEqual(["East", "West"]);
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
    name: "Bob Jones",
    designation: "LPN",
    roles: ["nurse"],
    fteWeight: 0.8,
    seniority: 2,
    wings: ["North"],
    phone: "555-1111",
    email: "bob@example.com",
    contactNotes: "Prefers text",
  };

  it("maps all fields correctly to snake_case", () => {
    const result = employeeToRow(baseEmployee, "org-99");

    expect(result.org_id).toBe("org-99");
    expect(result.name).toBe("Bob Jones");
    expect(result.designation).toBe("LPN");
    expect(result.roles).toEqual(["nurse"]);
    expect(result.fte_weight).toBe(0.8);
    expect(result.seniority).toBe(2);
    expect(result.wings).toEqual(["North"]);
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
    name: fc.string({ minLength: 1 }),
    designation: fc.constantFrom("JLCSN", "CSN III", "CSN II", "STAFF", "—"),
    roles: fc.array(fc.string()),
    fte_weight: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
    seniority: fc.integer({ min: 1 }),
    wings: fc.array(fc.string()),
    phone: fc.string(),
    email: fc.string(),
    contact_notes: fc.string(),
  });

  it("rowToEmployee(employeeToRow(rowToEmployee(row))) equals rowToEmployee(row)", () => {
    // Validates: Requirements 6.7
    fc.assert(
      fc.property(arbDbEmployee, (row) => {
        const employee1 = rowToEmployee(row);
        const reconstructedRow = { ...employeeToRow(employee1, row.org_id), id: row.id };
        const employee2 = rowToEmployee(reconstructedRow as DbEmployee);
        expect(employee2).toEqual(employee1);
      }),
    );
  });
});
