import { describe, expect, it } from "vitest";
import type { NextResponse } from "next/server";
import {
  validateNamedItems,
  validateDepartments,
  validateFocusArea,
  validateShiftCategory,
  validateJob,
  validateAbsenceType,
  validateIndicatorType,
  type NamedItemInput,
  type DepartmentInput,
  type FocusAreaInput,
  type ShiftCategoryInput,
  type JobInput,
  type AbsenceTypeInput,
  type IndicatorTypeInput,
} from "./validation";

// Behavior-pinning tests: these assert the CURRENT validation semantics
// (written before the validators were deduplicated into a generic core, as the
// proof that the dedupe preserves behavior). If one of these fails after a
// refactor, the refactor changed behavior — fix the refactor, not the test.

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeNamedItem(overrides: Partial<NamedItemInput> = {}): NamedItemInput {
  return { id: 1, orgId: ORG_ID, name: "Certified", abbr: "CERT", sortOrder: 1, ...overrides };
}

function makeDepartment(overrides: Partial<DepartmentInput> = {}): DepartmentInput {
  return {
    id: 1,
    orgId: ORG_ID,
    name: "Operations",
    abbr: "OPS",
    type: "scheduled",
    sortOrder: 1,
    ...overrides,
  };
}

function makeFocusArea(overrides: Partial<FocusAreaInput> = {}): FocusAreaInput {
  return { orgId: ORG_ID, departmentId: null, name: "ICU", sortOrder: 1, ...overrides };
}

function makeShiftCategory(overrides: Partial<ShiftCategoryInput> = {}): ShiftCategoryInput {
  return { orgId: ORG_ID, name: "Day", color: "#FFFFFF", sortOrder: 1, focusAreaId: null, ...overrides };
}

function makeJob(overrides: Partial<JobInput> = {}): JobInput {
  return {
    orgId: ORG_ID,
    name: "Nurse",
    abbr: "RN",
    showOnGrid: true,
    color: "#FFFFFF",
    border: "#000000",
    text: "#000000",
    sortOrder: 1,
    ...overrides,
  };
}

function makeAbsenceType(overrides: Partial<AbsenceTypeInput> = {}): AbsenceTypeInput {
  return {
    orgId: ORG_ID,
    label: "PTO",
    name: "Paid time off",
    color: "#FFFFFF",
    border: "#000000",
    text: "#000000",
    sortOrder: 1,
    ...overrides,
  };
}

function makeIndicatorType(overrides: Partial<IndicatorTypeInput> = {}): IndicatorTypeInput {
  return { orgId: ORG_ID, name: "On call", color: "#FFFFFF", sortOrder: 1, ...overrides };
}

/** Asserts the result is the 400 error branch and returns its parsed body. */
async function expectValidationError(result: unknown): Promise<{
  error: string;
  fieldErrors: Record<string, string | null>;
}> {
  expect(result).toHaveProperty("response");
  const response = (result as { response: NextResponse }).response;
  expect(response.status).toBe(400);
  return response.json();
}

describe("validateNamedItems", () => {
  it("trims and collapses whitespace in names; keeps abbr case; empty abbr becomes ''", () => {
    const result = validateNamedItems(
      [makeNamedItem({ name: "  Trauma   Nurse ", abbr: " iCu " }), makeNamedItem({ id: 2, name: "B", abbr: "" })],
      { itemLabel: "Certification" },
    );
    expect(result).not.toHaveProperty("response");
    const { items } = result as { items: NamedItemInput[] };
    expect(items[0].name).toBe("Trauma Nurse");
    // Named-item abbrs are deliberately NOT uppercased (unlike shift/job/absence codes).
    expect(items[0].abbr).toBe("iCu");
    expect(items[1].abbr).toBe("");
  });

  it("rejects a missing name with per-item field errors", async () => {
    const result = validateNamedItems([makeNamedItem({ name: "   " })], { itemLabel: "Certification" });
    const body = await expectValidationError(result);
    expect(body.error).toBe("Certification name is required");
    expect(body.fieldErrors["items.0.name"]).toBe("Certification name is required");
    expect(body.fieldErrors["items.0.abbr"]).toBeNull();
  });

  it("rejects names over 80 characters and abbrs over 20 characters", async () => {
    const longName = await expectValidationError(
      validateNamedItems([makeNamedItem({ name: "x".repeat(81) })], { itemLabel: "Certification" }),
    );
    expect(longName.error).toBe("Certification name must be 80 characters or fewer");

    const longAbbr = await expectValidationError(
      validateNamedItems([makeNamedItem({ abbr: "y".repeat(21) })], { itemLabel: "Certification" }),
    );
    expect(longAbbr.error).toBe("Certification abbreviation must be 20 characters or fewer");
  });

  it("rejects URL-like names (disallowUrl semantics)", async () => {
    const body = await expectValidationError(
      validateNamedItems([makeNamedItem({ name: "see www.example.com" })], { itemLabel: "Certification" }),
    );
    expect(body.error).toBe("Certification name cannot contain a URL");
  });

  it("rejects case-insensitive duplicate names, reporting the lowercased name", async () => {
    const body = await expectValidationError(
      validateNamedItems(
        [makeNamedItem({ name: "Alpha" }), makeNamedItem({ id: 2, name: " ALPHA " })],
        { itemLabel: "Certification" },
      ),
    );
    // The dedupe runs on lowercased normalized names, so the message quotes the lowercase form.
    expect(body.error).toBe('Duplicate certification name: "alpha"');
  });

  it("surfaces the first field error in item/field order as the top-level error", async () => {
    const body = await expectValidationError(
      validateNamedItems(
        [makeNamedItem({ abbr: "y".repeat(21) }), makeNamedItem({ id: 2, name: "" })],
        { itemLabel: "Role" },
      ),
    );
    // items.0.name is fine, items.0.abbr errors before items.1.name does.
    expect(body.error).toBe("Role abbreviation must be 20 characters or fewer");
    expect(body.fieldErrors["items.1.name"]).toBe("Role name is required");
  });
});

describe("validateDepartments", () => {
  it("rejects duplicate names within the same department type", async () => {
    const body = await expectValidationError(
      validateDepartments([
        makeDepartment({ name: "Ops" }),
        makeDepartment({ id: 2, name: "OPS " }),
      ]),
    );
    expect(body.error).toBe('Duplicate department name: "ops"');
  });

  it("allows the same name across scheduled and management types", () => {
    const result = validateDepartments([
      makeDepartment({ name: "Ops", type: "scheduled" }),
      makeDepartment({ id: 2, name: "Ops", type: "management" }),
    ]);
    expect(result).not.toHaveProperty("response");
  });

  it("normalizes names and rejects missing ones", async () => {
    const ok = validateDepartments([makeDepartment({ name: "  Front   Desk " })]);
    expect((ok as { items: DepartmentInput[] }).items[0].name).toBe("Front Desk");

    const body = await expectValidationError(validateDepartments([makeDepartment({ name: "" })]));
    expect(body.error).toBe("Department name is required");
    expect(body.fieldErrors["items.0.name"]).toBe("Department name is required");
  });
});

describe("validateFocusArea", () => {
  it("normalizes the name on success", () => {
    const result = validateFocusArea(makeFocusArea({ name: "  East   Wing " }));
    expect((result as { focusArea: FocusAreaInput }).focusArea.name).toBe("East Wing");
  });

  it("rejects missing and over-long names under the focusArea.name key", async () => {
    const missing = await expectValidationError(validateFocusArea(makeFocusArea({ name: " " })));
    expect(missing.error).toBe("Focus area name is required");
    expect(missing.fieldErrors).toEqual({ "focusArea.name": "Focus area name is required" });

    const long = await expectValidationError(
      validateFocusArea(makeFocusArea({ name: "x".repeat(81) })),
    );
    expect(long.error).toBe("Focus area name must be 80 characters or fewer");
  });
});

describe("validateShiftCategory", () => {
  it("uppercases the abbr and maps empty/undefined abbr to null", () => {
    const upper = validateShiftCategory(makeShiftCategory({ abbr: " am " }));
    expect((upper as { shiftCategory: ShiftCategoryInput }).shiftCategory.abbr).toBe("AM");

    const empty = validateShiftCategory(makeShiftCategory({ abbr: "  " }));
    expect((empty as { shiftCategory: ShiftCategoryInput }).shiftCategory.abbr).toBeNull();

    const missing = validateShiftCategory(makeShiftCategory({ abbr: undefined }));
    expect((missing as { shiftCategory: ShiftCategoryInput }).shiftCategory.abbr).toBeNull();
  });

  it("rejects missing names, names over 50, and codes over 8", async () => {
    const name = await expectValidationError(validateShiftCategory(makeShiftCategory({ name: "" })));
    expect(name.error).toBe("Shift name is required");
    expect(name.fieldErrors["shiftCategory.name"]).toBe("Shift name is required");

    const longName = await expectValidationError(
      validateShiftCategory(makeShiftCategory({ name: "x".repeat(51) })),
    );
    expect(longName.error).toBe("Shift name must be 50 characters or fewer");

    const longAbbr = await expectValidationError(
      validateShiftCategory(makeShiftCategory({ abbr: "y".repeat(9) })),
    );
    expect(longAbbr.error).toBe("Shift code must be 8 characters or fewer");
  });
});

describe("validateJob", () => {
  it("requires the abbr and uppercases it", async () => {
    const ok = validateJob(makeJob({ abbr: " rn " }));
    expect((ok as { job: JobInput }).job.abbr).toBe("RN");

    const missing = await expectValidationError(validateJob(makeJob({ abbr: "  " })));
    expect(missing.error).toBe("Job abbreviation is required");
    expect(missing.fieldErrors["job.abbr"]).toBe("Job abbreviation is required");
  });

  it("rejects names over 50 and abbrs over 6", async () => {
    const longName = await expectValidationError(validateJob(makeJob({ name: "x".repeat(51) })));
    expect(longName.error).toBe("Job name must be 50 characters or fewer");

    const longAbbr = await expectValidationError(validateJob(makeJob({ abbr: "y".repeat(7) })));
    expect(longAbbr.error).toBe("Job abbreviation must be 6 characters or fewer");
  });
});

describe("validateAbsenceType", () => {
  it("treats the label as an optional uppercase code; empty label stays ''", () => {
    const upper = validateAbsenceType(makeAbsenceType({ label: " pto " }));
    expect((upper as { absenceType: AbsenceTypeInput }).absenceType.label).toBe("PTO");

    const empty = validateAbsenceType(makeAbsenceType({ label: "  " }));
    expect((empty as { absenceType: AbsenceTypeInput }).absenceType.label).toBe("");
  });

  it("rejects codes over 6 and missing names; the label error wins when both fail", async () => {
    const longLabel = await expectValidationError(
      validateAbsenceType(makeAbsenceType({ label: "y".repeat(7) })),
    );
    expect(longLabel.error).toBe("Absence code must be 6 characters or fewer");

    const missingName = await expectValidationError(
      validateAbsenceType(makeAbsenceType({ name: " " })),
    );
    expect(missingName.error).toBe("Absence name is required");

    // fieldErrors insertion order is label-then-name, so the label error surfaces first.
    const both = await expectValidationError(
      validateAbsenceType(makeAbsenceType({ label: "y".repeat(7), name: "" })),
    );
    expect(both.error).toBe("Absence code must be 6 characters or fewer");
    expect(both.fieldErrors["absenceType.name"]).toBe("Absence name is required");
  });
});

describe("validateIndicatorType", () => {
  it("normalizes the name on success", () => {
    const result = validateIndicatorType(makeIndicatorType({ name: "  On   Call " }));
    expect((result as { indicatorType: IndicatorTypeInput }).indicatorType.name).toBe("On Call");
  });

  it("rejects missing and over-long names under the indicatorType.name key", async () => {
    const missing = await expectValidationError(validateIndicatorType(makeIndicatorType({ name: "" })));
    expect(missing.error).toBe("Indicator name is required");
    expect(missing.fieldErrors).toEqual({ "indicatorType.name": "Indicator name is required" });

    const long = await expectValidationError(
      validateIndicatorType(makeIndicatorType({ name: "x".repeat(51) })),
    );
    expect(long.error).toBe("Indicator name must be 50 characters or fewer");
  });
});
