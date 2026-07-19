import { describe, it, expect } from "vitest";
import {
  rowToOrganization,
  rowToFocusArea,
  rowToJobDefinition,
  rowToAssignmentDefinition,
  rowToAbsenceType,
  rowToShiftRequest,
} from "@/lib/db";
import type {
  DbOrganization,
  DbFocusArea,
  DbJobDefinition,
  DbAssignmentDefinition,
  DbAbsenceType,
  DbShiftRequest,
} from "@/lib/db";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";

// ── rowToOrganization ──────────────────────────────────────────────────────────

describe("rowToOrganization", () => {
  it("maps all fields correctly with camelCase conversion", () => {
    const row: DbOrganization = {
      id: "org-123",
      name: "Sunrise Care",
      address: "123 Main St",
      address_line_1: "123 Main St",
      address_line_2: "Suite 100",
      address_city: "San Francisco",
      address_state: "CA",
      address_postal_code: "94108",
      address_country: "United States",
      phone: "555-1234",
      employee_count: 42,
      slug: null,
      focus_area_label: null,
      certification_label: null,
      role_label: null,
      department_label: null,
      shift_display_mode: null,
      timezone: null,
      pay_period_start_date: "2026-04-20",
      archived_at: null,
      suspended_at: null,
      suspended_reason: null,
      enforce_conflict_prevention: false,
      default_shift_enabled: true,
      stripe_customer_id: null,
      subscription_status: null,
      trial_ends_at: null,
      trial_started_at: null,
      subscription_seats: null,
      data_retention_days: 365,
      feature_overrides: {},
      workspace_kind: "real",
      sandbox_owner_user_id: null,
      sandbox_source_org_id: null,
      updated_at: null,
    };

    const result = rowToOrganization(row);

    expect(result.id).toBe("org-123");
    expect(result.name).toBe("Sunrise Care");
    expect(result.address).toBe("123 Main St, Suite 100, San Francisco, CA 94108, United States");
    expect(result.addressLine1).toBe("123 Main St");
    expect(result.addressLine2).toBe("Suite 100");
    expect(result.addressCity).toBe("San Francisco");
    expect(result.addressState).toBe("CA");
    expect(result.addressPostalCode).toBe("94108");
    expect(result.addressCountry).toBe("United States");
    expect(result.phone).toBe("555-1234");
    expect(result.employeeCount).toBe(42);
    expect(result.payPeriodStartDate).toBe("2026-04-20");
  });

  it("maps employee_count: null to employeeCount: null", () => {
    const row: DbOrganization = {
      id: "org-456",
      name: "Sunset Clinic",
      address: "456 Oak Ave",
      address_line_1: "",
      address_line_2: "",
      address_city: "",
      address_state: "",
      address_postal_code: "",
      address_country: "",
      phone: "555-5678",
      employee_count: null,
      slug: null,
      focus_area_label: null,
      certification_label: null,
      role_label: null,
      department_label: null,
      shift_display_mode: null,
      timezone: null,
      pay_period_start_date: null,
      archived_at: null,
      suspended_at: null,
      suspended_reason: null,
      enforce_conflict_prevention: false,
      default_shift_enabled: true,
      stripe_customer_id: null,
      subscription_status: null,
      trial_ends_at: null,
      trial_started_at: null,
      subscription_seats: null,
      data_retention_days: 365,
      feature_overrides: {},
      workspace_kind: "real",
      sandbox_owner_user_id: null,
      sandbox_source_org_id: null,
      updated_at: null,
    };

    const result = rowToOrganization(row);

    expect(result.employeeCount).toBeNull();
    expect(result.addressLine1).toBe("456 Oak Ave");
    expect(result.address).toBe("456 Oak Ave");
    expect(result.departmentLabel).toBe("Scheduled Departments");
    expect(result.payPeriodStartDate).toBeNull();
  });
});

// ── rowToFocusArea ──────────────────────────────────────────────────────────

describe("rowToFocusArea", () => {
  it("maps all fields correctly with camelCase conversion", () => {
    const row: DbFocusArea = {
      id: 7,
      org_id: "org-abc",
      name: "East Section",
      color: "#BFDBFE",
      sort_order: 3,
      department_id: null,
      archived_at: null,
    };

    const result = rowToFocusArea(row);

    expect(result.id).toBe(7);
    expect(result.orgId).toBe("org-abc");
    expect(result.name).toBe("East Section");
    expect(result.color).toBe("#BFDBFE");
    expect(result.sortOrder).toBe(3);
    expect(result.archivedAt).toBeNull();
  });

  it("maps archived_at timestamp to archivedAt", () => {
    const row: DbFocusArea = {
      id: 8,
      org_id: "org-abc",
      name: "Archived Section",
      color: null,
      sort_order: 4,
      department_id: null,
      archived_at: "2026-03-10T12:00:00Z",
    };

    const result = rowToFocusArea(row);
    expect(result.archivedAt).toBe("2026-03-10T12:00:00Z");
    expect(result.color).toBe("#E2E8F0");
  });
});

// ── rowToJobDefinition ───────────────────────────────────────────────────────

describe("rowToJobDefinition", () => {
  it("maps multi-focus-area and department placement arrays", () => {
    const row: DbJobDefinition = {
      id: 11,
      org_id: "org-abc",
      name: "Supervisor",
      abbr: "SUP",
      show_on_grid: true,
      assignment_mode: "with_shift",
      eligibility_mode: "and",
      focus_area_ids: [3, 7],
      department_ids: [2],
      applicable_shift_ids: [10, 11],
      eligible_role_ids: [5],
      required_certification_ids: [9],
      color: "#E2E8F0",
      border_color: "#CBD5E1",
      text_color: "#1E293B",
      shift_time_overrides: {
        "10": {
          startTime: "08:00:00",
          endTime: "16:00:00",
        },
      },
      shift_color_overrides: {
        "11": "#BFDBFE",
      },
      default_start_time: "07:00:00",
      default_end_time: "15:00:00",
      default_duration_hours: null,
      default_duration_minutes: null,
      sort_order: 1,
      system_key: null,
      archived_at: null,
    };

    const result = rowToJobDefinition(row);

    expect(result.focusAreaIds).toEqual([3, 7]);
    expect(result.focusAreaId).toBe(3);
    expect(result.departmentIds).toEqual([2]);
    expect(result.applicableShiftIds).toEqual([10, 11]);
    expect(result.eligibilityMode).toBe("and");
    expect(result.color).toBe("");
    expect(result.border).toBe("");
    expect(result.text).toBe("");
    expect(result.shiftTimeOverrides).toEqual({
      "10": {
        startTime: "08:00",
        endTime: "16:00",
      },
    });
    expect(result.shiftColorOverrides).toEqual({
      "11": "#BFDBFE",
    });
    expect(result.defaultStartTime).toBe("07:00");
    expect(result.defaultEndTime).toBe("15:00");
  });

  it("preserves custom style fields for shiftless jobs", () => {
    const row: DbJobDefinition = {
      id: 12,
      org_id: "org-abc",
      name: "Office",
      abbr: "OFC",
      show_on_grid: true,
      assignment_mode: "shiftless",
      eligibility_mode: "and",
      focus_area_ids: [],
      department_ids: [],
      applicable_shift_ids: [],
      eligible_role_ids: [],
      required_certification_ids: [],
      color: "#FDE68A",
      border_color: "#B45309",
      text_color: "#78350F",
      shift_time_overrides: {},
      shift_color_overrides: {},
      default_start_time: null,
      default_end_time: null,
      default_duration_hours: 4,
      default_duration_minutes: 0,
      sort_order: 2,
      system_key: null,
      archived_at: null,
    };

    const result = rowToJobDefinition(row);

    expect(result.color).toBe("#FDE68A");
    expect(result.border).toBe("#B45309");
    expect(result.text).toBe("#78350F");
  });
});

// ── rowToAssignmentDefinition ────────────────────────────────────────────────────────────

const baseAssignmentDefinitionRow: DbAssignmentDefinition = {
  id: 1,
  org_id: "org-1",
  label: "D",
  name: "Day",
  color: "#fff",
  border_color: "#000",
  text_color: "#333",
  category_id: null,
  shift_id: null,
  job_id: null,
  is_general: false,
  focus_area_id: null,
  sort_order: 0,
  required_certification_ids: [],
  default_start_time: null,
  default_end_time: null,
  default_duration_hours: null,
  default_duration_minutes: null,
  archived_at: null,
};

describe("rowToAssignmentDefinition", () => {
  it("category_id: null maps to categoryId: null", () => {
    const result = rowToAssignmentDefinition({ ...baseAssignmentDefinitionRow, category_id: null });
    expect(result.categoryId).toBeNull();
  });

  it("category_id: 5 maps to categoryId: 5", () => {
    const result = rowToAssignmentDefinition({ ...baseAssignmentDefinitionRow, category_id: 5 });
    expect(result.categoryId).toBe(5);
  });

  it("is_general: false maps to isGeneral: false", () => {
    const result = rowToAssignmentDefinition({ ...baseAssignmentDefinitionRow, is_general: false });
    expect(result.isGeneral).toBe(false);
  });

  it("is_general: true maps to isGeneral: true", () => {
    const result = rowToAssignmentDefinition({ ...baseAssignmentDefinitionRow, is_general: true });
    expect(result.isGeneral).toBe(true);
  });

  it("focus_area_id: null maps to focusAreaId: null", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      focus_area_id: null,
    });
    expect(result.focusAreaId).toBeNull();
  });

  it("focus_area_id: 7 maps to focusAreaId: 7", () => {
    const result = rowToAssignmentDefinition({ ...baseAssignmentDefinitionRow, focus_area_id: 7 });
    expect(result.focusAreaId).toBe(7);
  });

  it("archived_at: null maps to archivedAt: null", () => {
    const result = rowToAssignmentDefinition({ ...baseAssignmentDefinitionRow, archived_at: null });
    expect(result.archivedAt).toBeNull();
  });

  it("archived_at: timestamp maps to archivedAt: string", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      archived_at: "2026-03-10T12:00:00Z",
    });
    expect(result.archivedAt).toBe("2026-03-10T12:00:00Z");
  });

  it("default_duration_hours: null maps to defaultDurationHours: null", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_duration_hours: null,
    });
    expect(result.defaultDurationHours).toBeNull();
  });

  it("default_duration_hours: 8 maps to defaultDurationHours: 8", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_duration_hours: 8,
    });
    expect(result.defaultDurationHours).toBe(8);
  });

  it("default_duration_minutes: null maps to defaultDurationMinutes: null", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_duration_minutes: null,
    });
    expect(result.defaultDurationMinutes).toBeNull();
  });

  it("default_duration_minutes: 30 maps to defaultDurationMinutes: 30", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_duration_minutes: 30,
    });
    expect(result.defaultDurationMinutes).toBe(30);
  });
});

// ── Property 9: rowToAssignmentDefinition field mapping ──────────────────────────────────

import * as fc from "fast-check";

// Feature: comprehensive-test-suite, Property 9: rowToAssignmentDefinition field mapping
describe("rowToAssignmentDefinition — Property 9: field mapping correctness", () => {
  const arbDbAssignmentDefinition = fc.record({
    id: fc.integer({ min: 1 }),
    org_id: fc.string({ minLength: 1 }),
    label: fc.string({ minLength: 1 }),
    name: fc.string({ minLength: 1 }),
    color: fc.string(),
    border_color: fc.string(),
    text_color: fc.string(),
    category_id: fc.option(fc.integer({ min: 1 }), { nil: null }),
    shift_id: fc.option(fc.integer({ min: 1 }), { nil: null }),
    job_id: fc.option(fc.integer({ min: 1 }), { nil: null }),
    is_general: fc.boolean(),
    focus_area_id: fc.option(fc.integer({ min: 1 }), { nil: null }),
    sort_order: fc.integer({ min: 0 }),
    required_certification_ids: fc.array(fc.integer({ min: 1 })),
    default_start_time: fc.option(fc.string(), { nil: null }),
    default_end_time: fc.option(fc.string(), { nil: null }),
    default_duration_hours: fc.option(fc.integer({ min: 0, max: 23 }), { nil: null }),
    default_duration_minutes: fc.option(fc.integer({ min: 0, max: 59 }), { nil: null }),
    archived_at: fc.option(fc.string(), { nil: null }),
    version: fc.constant(0),
  });

  it("category_id passes through correctly; is_general preserves boolean value", () => {
    fc.assert(
      fc.property(arbDbAssignmentDefinition, (row) => {
        const result = rowToAssignmentDefinition(row);

        // categoryId round-trips
        expect(result.categoryId).toBe(row.category_id ?? null);

        // is_general preserves the boolean value
        expect(result.isGeneral).toBe(row.is_general);

        // focus_area_id passes through as-is
        expect(result.focusAreaId).toBe(row.focus_area_id ?? null);
      }),
    );
  });
});

// ── rowToAbsenceType ─────────────────────────────────────────────────────────

describe("rowToAbsenceType", () => {
  const baseAbsenceTypeRow: DbAbsenceType = {
    id: 1,
    org_id: "org-1",
    label: "X",
    name: "Off",
    color: "#E2E8F0",
    border_color: "transparent",
    text_color: "#1E293B",
    sort_order: 0,
    archived_at: null,
  };

  it("maps all fields correctly with camelCase conversion", () => {
    const result = rowToAbsenceType(baseAbsenceTypeRow);
    expect(result.id).toBe(1);
    expect(result.orgId).toBe("org-1");
    expect(result.label).toBe("X");
    expect(result.name).toBe("Off");
    expect(result.color).toBe("#E2E8F0");
    expect(result.border).toBe("transparent");
    expect(result.text).toBe("#1E293B");
    expect(result.sortOrder).toBe(0);
    expect(result.archivedAt).toBeNull();
  });

  it("maps archived_at timestamp to archivedAt", () => {
    const result = rowToAbsenceType({ ...baseAbsenceTypeRow, archived_at: "2026-03-10T12:00:00Z" });
    expect(result.archivedAt).toBe("2026-03-10T12:00:00Z");
  });
});

// ── rowToShiftRequest ────────────────────────────────────────────────────────

describe("rowToShiftRequest", () => {
  const assignmentLabelMap = new Map<number, string>([[44, "D"]]);

  it("derives request labels from canonical shift/job pairs", () => {
    const assignmentIdByPair = createAssignmentDefinitionIdByPairMap([
      { id: 44, shiftId: 101, jobId: 91, archivedAt: null },
    ]);
    const row = {
      id: "req-1",
      org_id: "org-1",
      type: "pickup",
      status: "open",
      requester_emp_id: "emp-1",
      requester_first_name: "Nic",
      requester_last_name: "Kosmas",
      requester_shift_date: "2026-04-18",
      requester_state: {
        kind: "worked",
        segments: [{ shiftId: 101, jobId: 91, position: 0 }],
        absenceTypeId: null,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      },
      target_emp_id: null,
      target_first_name: null,
      target_last_name: null,
      target_shift_date: null,
      target_state: null,
      absence_type_id: null,
      parent_request_id: null,
      admin_user_id: null,
      admin_note: null,
      expires_at: "2026-04-21T12:00:00.000Z",
      resolved_at: null,
      created_at: "2026-04-18T12:00:00.000Z",
      updated_at: "2026-04-18T12:00:00.000Z",
    } satisfies DbShiftRequest;

    const result = rowToShiftRequest(row, assignmentLabelMap, undefined, assignmentIdByPair);

    expect(result.requesterAssignmentDefinitionIds).toEqual([44]);
    expect(result.requesterShiftLabel).toBe("D");
  });

  it("derives request fields from canonical request state", () => {
    const row = {
      id: "req-2",
      org_id: "org-1",
      type: "swap",
      status: "open",
      requester_emp_id: "emp-1",
      requester_first_name: "Nic",
      requester_last_name: "Kosmas",
      requester_shift_date: "2026-04-18",
      requester_state: {
        kind: "worked",
        segments: [{ shiftId: 101, jobId: 91, position: 0 }],
        absenceTypeId: null,
        customStartTime: "07:00:00",
        customEndTime: "15:00:00",
        seriesId: null,
        fromRecurring: false,
      },
      target_emp_id: "emp-2",
      target_first_name: "Sarah",
      target_last_name: "Jenkins",
      target_shift_date: "2026-04-19",
      target_state: {
        kind: "worked",
        segments: [{ shiftId: 102, jobId: 92, position: 0 }],
        absenceTypeId: null,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      },
      absence_type_id: null,
      parent_request_id: null,
      admin_user_id: null,
      admin_note: null,
      expires_at: "2026-04-21T12:00:00.000Z",
      resolved_at: null,
      created_at: "2026-04-18T12:00:00.000Z",
      updated_at: "2026-04-18T12:00:00.000Z",
    } satisfies DbShiftRequest;

    const result = rowToShiftRequest(
      row,
      new Map([
        [44, "D"],
        [45, "E"],
      ]),
      undefined,
      new Map([
        ["101:91", 44],
        ["102:92", 45],
      ]),
    );

    expect(result.requesterShiftIds).toEqual([101]);
    expect(result.requesterJobIds).toEqual([91]);
    expect(result.requesterAssignmentDefinitionIds).toEqual([44]);
    expect(result.requesterShiftLabel).toBe("D");
    expect(result.targetShiftIds).toEqual([102]);
    expect(result.targetJobIds).toEqual([92]);
    expect(result.targetAssignmentDefinitionIds).toEqual([45]);
    expect(result.targetShiftLabel).toBe("E");
  });
});

// ── rowToEmployee ─────────────────────────────────────────────────────────────

import { rowToEmployee } from "@/lib/db";
import type { DbEmployee } from "@/lib/db";

const baseEmployeeRow: DbEmployee = {
  id: "emp-1",
  org_id: "org-1",
  employee_number: 1001,
  first_name: "Alice",
  last_name: "Smith",
  employment_type: "part_time",
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
  department_ids: [],
  dept_admin_ids: [],
  archived_at: null,
  version: 0,
  created_at: null,
};

describe("rowToEmployee", () => {
  it("maps all fields correctly", () => {
    const result = rowToEmployee(baseEmployeeRow);

    expect(result.id).toBe("emp-1");
    expect(result.firstName).toBe("Alice");
    expect(result.lastName).toBe("Smith");
    expect(result.employmentType).toBe("part_time");
    expect(result.certificationId).toBe(1);
    expect(result.roleIds).toEqual([2, 3]);
    expect(result.seniority).toBe(3);
    expect(result.focusAreaIds).toEqual([1, 2]);
    expect(result.phone).toBe("555-9999");
    expect(result.email).toBe("alice@example.com");
    expect(result.contactNotes).toBe("Call after 9am");
  });

  it("phone: null defaults to empty string", () => {
    const row = { ...baseEmployeeRow, phone: null } as unknown as Parameters<
      typeof rowToEmployee
    >[0];
    const result = rowToEmployee(row);
    expect(result.phone).toBe("");
  });

  it("email: null defaults to empty string", () => {
    const row = { ...baseEmployeeRow, email: null } as unknown as Parameters<
      typeof rowToEmployee
    >[0];
    const result = rowToEmployee(row);
    expect(result.email).toBe("");
  });

  it("contact_notes: null defaults to empty string", () => {
    const row = { ...baseEmployeeRow, contact_notes: null } as unknown as Parameters<
      typeof rowToEmployee
    >[0];
    const result = rowToEmployee(row);
    expect(result.contactNotes).toBe("");
  });
});

// ── employeeToRow ─────────────────────────────────────────────────────────────

import { employeeToRow } from "@/lib/db";
import type { Employee } from "@/types";

describe("employeeToRow", () => {
  const baseEmployee: Omit<Employee, "id" | "employeeNumber" | "createdAt"> = {
    firstName: "Bob",
    lastName: "Jones",
    employmentType: "full_time",
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
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  };

  it("maps all fields correctly to snake_case", () => {
    const result = employeeToRow(baseEmployee, "org-99");

    expect(result.org_id).toBe("org-99");
    expect(result.first_name).toBe("Bob");
    expect(result.last_name).toBe("Jones");
    expect(result.employment_type).toBe("full_time");
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
    employee_number: fc.integer({ min: 1, max: 99_999 }),
    first_name: fc.string({ minLength: 1 }),
    last_name: fc.string({ minLength: 1 }),
    employment_type: fc.constantFrom("full_time" as const, "part_time" as const),
    status: fc.constantFrom("active" as const, "inactive" as const, "removed" as const),
    status_changed_at: fc.oneof(
      fc.constant(null as string | null),
      fc.constant("2026-01-01T00:00:00Z"),
    ),
    status_note: fc.string(),
    certification_id: fc.oneof(fc.constant(null as number | null), fc.integer({ min: 1 })),
    role_ids: fc.array(fc.integer({ min: 1 })),
    seniority: fc.integer({ min: 1 }),
    focus_area_ids: fc.array(fc.integer({ min: 1 })),
    phone: fc.string(),
    email: fc.string(),
    contact_notes: fc.string(),
    user_id: fc.constant(null as string | null),
    department_ids: fc.constant([] as number[]),
    dept_admin_ids: fc.constant([] as number[]),
    archived_at: fc.constant(null as string | null),
    version: fc.constant(0),
    created_at: fc.constant(null as string | null),
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
          employee_number: row.employee_number,
          status: row.status,
          status_changed_at: row.status_changed_at,
          status_note: row.status_note,
          archived_at: row.archived_at,
          created_at: row.created_at,
        };
        const employee2 = rowToEmployee(reconstructedRow as DbEmployee);
        expect(employee2).toEqual(employee1);
      }),
    );
  });
});

// ── trimTime behavior via rowToAssignmentDefinition ─────────────────────────────────────

describe("rowToAssignmentDefinition trimTime behavior", () => {
  it("strips seconds from default_start_time: '07:00:00' → '07:00'", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_start_time: "07:00:00",
    });
    expect(result.defaultStartTime).toBe("07:00");
  });

  it("keeps default_start_time already in HH:MM format: '07:00' → '07:00'", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_start_time: "07:00",
    });
    expect(result.defaultStartTime).toBe("07:00");
  });

  it("maps default_start_time: null → null", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_start_time: null,
    });
    expect(result.defaultStartTime).toBeNull();
  });

  it("strips seconds from default_end_time: '15:30:45' → '15:30'", () => {
    const result = rowToAssignmentDefinition({
      ...baseAssignmentDefinitionRow,
      default_end_time: "15:30:45",
    });
    expect(result.defaultEndTime).toBe("15:30");
  });
});
