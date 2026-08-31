import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";

// Entity input schemas + validation for /api/settings/config. Extracted verbatim
// from route.ts; the `_lib` prefix keeps this folder non-routable.

export const namedItemSchema = z.object({
  id: z.number().int(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string(),
  isScheduleRole: z.boolean().optional(),
  departmentIds: z.array(z.number().int()).optional(),
  requiredCertificationIds: z.array(z.number().int()).optional(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

export const departmentSchema = z.object({
  id: z.number().int(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string(),
  type: z.enum(["scheduled", "management"]),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
  permissions: z.record(z.string(), z.boolean()).nullable().optional(),
});

export const focusAreaSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  departmentId: z.number().int().nullable(),
  name: z.string(),
  color: z.string().optional().nullable(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

export const shiftCategorySchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  color: z.string(),
  sortOrder: z.number().int(),
  focusAreaId: z.number().int().nullable(),
  breakMinutes: z.number().int().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

export const jobSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string(),
  showOnGrid: z.boolean(),
  assignmentMode: z.enum(["with_shift", "shiftless", "both"]).optional(),
  eligibilityMode: z.enum(["and", "or"]).optional(),
  focusAreaIds: z.array(z.number().int()).optional(),
  departmentIds: z.array(z.number().int()).optional(),
  applicableShiftIds: z.array(z.number().int()).optional(),
  eligibleRoleIds: z.array(z.number().int()).optional(),
  requiredCertificationIds: z.array(z.number().int()).optional(),
  color: z.string(),
  border: z.string(),
  text: z.string(),
  shiftTimeOverrides: z.record(z.string(), z.unknown()).optional(),
  shiftColorOverrides: z.record(z.string(), z.string()).optional(),
  defaultStartTime: z.string().nullable().optional(),
  defaultEndTime: z.string().nullable().optional(),
  defaultDurationHours: z.number().int().nullable().optional(),
  defaultDurationMinutes: z.number().int().nullable().optional(),
  sortOrder: z.number().int(),
  systemKey: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

export const absenceTypeSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  label: z.string(),
  name: z.string(),
  color: z.string(),
  border: z.string(),
  text: z.string(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

export const indicatorTypeSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

export type NamedItemInput = z.infer<typeof namedItemSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type FocusAreaInput = z.infer<typeof focusAreaSchema>;
export type ShiftCategoryInput = z.infer<typeof shiftCategorySchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type AbsenceTypeInput = z.infer<typeof absenceTypeSchema>;
export type IndicatorTypeInput = z.infer<typeof indicatorTypeSchema>;

export const SETTINGS_NAME_MAX = 80;
export const SETTINGS_ABBR_MAX = 20;
export const FOCUS_AREA_NAME_MAX = 80;
export const SHIFT_CATEGORY_NAME_MAX = 50;
export const SHIFT_CATEGORY_ABBR_MAX = 8;
export const JOB_NAME_MAX = 50;
export const JOB_ABBR_MAX = 6;
export const ABSENCE_LABEL_MAX = 6;
export const ABSENCE_NAME_MAX = 50;
export const INDICATOR_NAME_MAX = 50;

export function buildSettingsValidationResponse(args: {
  error: string;
  fieldErrors: Record<string, string | null>;
}) {
  return NextResponse.json(args, { status: 400 });
}

export function findDuplicateValue(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return null;
}

export function validateSettingsTextField(args: {
  value: string;
  label: string;
  maxLength: number;
  required?: boolean;
}): string | null {
  return getLineTextError(args.value, {
    label: args.label,
    maxLength: args.maxLength,
    required: args.required,
    disallowUrl: true,
  });
}

export function normalizeSettingsTextField(args: {
  value: string;
  label: string;
  maxLength: number;
  required?: boolean;
}): string {
  return normalizeLineText(args.value, {
    label: args.label,
    maxLength: args.maxLength,
    required: args.required,
    disallowUrl: true,
  });
}

// ── Generic validation core ─────────────────────────────────────────────────
// The seven entity validators below are thin config wrappers over this core.
// Their names, signatures, and result shapes are pinned by validation.test.ts —
// the tests were written against the previous hand-rolled implementations and
// must keep passing unchanged.

type TextFieldSpec = {
  kind: "text";
  key: string;
  errorKey: string;
  label: string;
  maxLength: number;
};

/**
 * A short code field (abbr / label). Optional codes are validated only when
 * non-empty and normalize an empty value to `emptyValue`; required codes are
 * always validated.
 */
type CodeFieldSpec = {
  kind: "code";
  key: string;
  errorKey: string;
  label: string;
  maxLength: number;
  required?: boolean;
  uppercase?: boolean;
  emptyValue?: "" | null;
};

type FieldSpec = TextFieldSpec | CodeFieldSpec;

function getFieldSpecError(value: string, spec: FieldSpec): string | null {
  if (spec.kind === "text") {
    return validateSettingsTextField({
      value,
      label: spec.label,
      maxLength: spec.maxLength,
      required: true,
    });
  }
  if (spec.required) {
    return getCodeError(value, {
      label: spec.label,
      maxLength: spec.maxLength,
      required: true,
      uppercase: spec.uppercase,
    });
  }
  return value.trim().length > 0
    ? getCodeError(value, {
        label: spec.label,
        maxLength: spec.maxLength,
        uppercase: spec.uppercase,
      })
    : null;
}

function normalizeFieldSpecValue(value: string, spec: FieldSpec): string | null {
  if (spec.kind === "text") {
    return normalizeSettingsTextField({
      value,
      label: spec.label,
      maxLength: spec.maxLength,
      required: true,
    });
  }
  if (spec.required) {
    return normalizeCode(value, {
      label: spec.label,
      maxLength: spec.maxLength,
      required: true,
      uppercase: spec.uppercase,
    });
  }
  if (value.trim().length > 0) {
    return normalizeCode(value, {
      label: spec.label,
      maxLength: spec.maxLength,
      uppercase: spec.uppercase,
    });
  }
  // NOTE: `emptyValue` may legitimately be null (shift-category abbr), so this
  // must not use `?? ""`.
  return spec.emptyValue === undefined ? "" : spec.emptyValue;
}

function readFieldValue(entity: Record<string, unknown>, key: string): string {
  const raw = entity[key];
  return typeof raw === "string" ? raw : "";
}

/**
 * Validates one entity against its field specs. Field errors are recorded in
 * spec order (insertion order determines which error becomes the top-level
 * message); on success every spec'd field is replaced by its normalized value.
 */
function validateEntity<T extends Record<string, unknown>>(
  entity: T,
  specs: FieldSpec[],
): { normalized: T } | { response: NextResponse } {
  const fieldErrors: Record<string, string | null> = {};
  for (const spec of specs) {
    fieldErrors[spec.errorKey] = getFieldSpecError(readFieldValue(entity, spec.key), spec);
  }

  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return { response: buildSettingsValidationResponse({ error: firstFieldError, fieldErrors }) };
  }

  const normalized = { ...entity };
  for (const spec of specs) {
    (normalized as Record<string, unknown>)[spec.key] = normalizeFieldSpecValue(
      readFieldValue(entity, spec.key),
      spec,
    );
  }
  return { normalized };
}

/**
 * Validates a list of entities (all field errors are collected across the whole
 * list before failing), then rejects case-insensitive duplicate names — within
 * `duplicate.groupBy` groups when set (e.g. department type). The duplicate
 * message quotes the lowercased normalized name, matching the original
 * implementations.
 */
function validateEntityList<T extends Record<string, unknown>>(
  items: T[],
  options: {
    specsForIndex: (index: number) => FieldSpec[];
    duplicate: { label: string; groupBy?: (item: T) => string };
  },
): { items: T[] } | { response: NextResponse } {
  const fieldErrors: Record<string, string | null> = {};
  const allSpecs = items.map((item, index) => {
    const specs = options.specsForIndex(index);
    for (const spec of specs) {
      fieldErrors[spec.errorKey] = getFieldSpecError(readFieldValue(item, spec.key), spec);
    }
    return specs;
  });

  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return { response: buildSettingsValidationResponse({ error: firstFieldError, fieldErrors }) };
  }

  const normalizedItems = items.map((item, index) => {
    const normalized = { ...item };
    for (const spec of allSpecs[index]) {
      (normalized as Record<string, unknown>)[spec.key] = normalizeFieldSpecValue(
        readFieldValue(item, spec.key),
        spec,
      );
    }
    return normalized;
  });

  const groups = new Map<string, string[]>();
  for (const item of normalizedItems) {
    const group = options.duplicate.groupBy?.(item) ?? "";
    const names = groups.get(group) ?? [];
    names.push(String(item.name).toLowerCase());
    groups.set(group, names);
  }
  for (const names of groups.values()) {
    const duplicateName = findDuplicateValue(names);
    if (duplicateName) {
      return {
        response: buildSettingsValidationResponse({
          error: `Duplicate ${options.duplicate.label} name: "${duplicateName}"`,
          fieldErrors,
        }),
      };
    }
  }

  return { items: normalizedItems };
}

// ── Entity validators ────────────────────────────────────────────────────────

export function validateNamedItems(
  items: NamedItemInput[],
  args: { itemLabel: string },
): { items: NamedItemInput[] } | { response: NextResponse } {
  return validateEntityList(items, {
    specsForIndex: (index) => [
      {
        kind: "text",
        key: "name",
        errorKey: `items.${index}.name`,
        label: `${args.itemLabel} name`,
        maxLength: SETTINGS_NAME_MAX,
      },
      {
        kind: "code",
        key: "abbr",
        errorKey: `items.${index}.abbr`,
        label: `${args.itemLabel} abbreviation`,
        maxLength: SETTINGS_ABBR_MAX,
        emptyValue: "",
      },
    ],
    duplicate: { label: args.itemLabel.toLowerCase() },
  });
}

export function validateDepartments(
  items: DepartmentInput[],
): { items: DepartmentInput[] } | { response: NextResponse } {
  return validateEntityList(items, {
    specsForIndex: (index) => [
      {
        kind: "text",
        key: "name",
        errorKey: `items.${index}.name`,
        label: "Department name",
        maxLength: SETTINGS_NAME_MAX,
      },
      {
        kind: "code",
        key: "abbr",
        errorKey: `items.${index}.abbr`,
        label: "Department abbreviation",
        maxLength: SETTINGS_ABBR_MAX,
        emptyValue: "",
      },
    ],
    // Duplicate names are only conflicts within the same department type.
    duplicate: { label: "department", groupBy: (item) => item.type },
  });
}

export function validateFocusArea(
  focusArea: FocusAreaInput,
): { focusArea: FocusAreaInput } | { response: NextResponse } {
  const result = validateEntity(focusArea, [
    {
      kind: "text",
      key: "name",
      errorKey: "focusArea.name",
      label: "Focus area name",
      maxLength: FOCUS_AREA_NAME_MAX,
    },
  ]);
  return "response" in result ? result : { focusArea: result.normalized };
}

export function validateShiftCategory(
  shiftCategory: ShiftCategoryInput,
): { shiftCategory: ShiftCategoryInput } | { response: NextResponse } {
  const result = validateEntity(shiftCategory, [
    {
      kind: "text",
      key: "name",
      errorKey: "shiftCategory.name",
      label: "Shift name",
      maxLength: SHIFT_CATEGORY_NAME_MAX,
    },
    {
      kind: "code",
      key: "abbr",
      errorKey: "shiftCategory.abbr",
      label: "Shift code",
      maxLength: SHIFT_CATEGORY_ABBR_MAX,
      uppercase: true,
      emptyValue: null,
    },
  ]);
  return "response" in result ? result : { shiftCategory: result.normalized };
}

export function validateJob(job: JobInput): { job: JobInput } | { response: NextResponse } {
  const result = validateEntity(job, [
    { kind: "text", key: "name", errorKey: "job.name", label: "Job name", maxLength: JOB_NAME_MAX },
    {
      kind: "code",
      key: "abbr",
      errorKey: "job.abbr",
      label: "Job abbreviation",
      maxLength: JOB_ABBR_MAX,
      required: true,
      uppercase: true,
    },
  ]);
  return "response" in result ? result : { job: result.normalized };
}

export function validateAbsenceType(
  absenceType: AbsenceTypeInput,
): { absenceType: AbsenceTypeInput } | { response: NextResponse } {
  const result = validateEntity(absenceType, [
    // Label first: when both fields fail, the code error surfaces top-level.
    {
      kind: "code",
      key: "label",
      errorKey: "absenceType.label",
      label: "Absence code",
      maxLength: ABSENCE_LABEL_MAX,
      uppercase: true,
      emptyValue: "",
    },
    {
      kind: "text",
      key: "name",
      errorKey: "absenceType.name",
      label: "Absence name",
      maxLength: ABSENCE_NAME_MAX,
    },
  ]);
  return "response" in result ? result : { absenceType: result.normalized };
}

export function validateIndicatorType(
  indicatorType: IndicatorTypeInput,
): { indicatorType: IndicatorTypeInput } | { response: NextResponse } {
  const result = validateEntity(indicatorType, [
    {
      kind: "text",
      key: "name",
      errorKey: "indicatorType.name",
      label: "Indicator name",
      maxLength: INDICATOR_NAME_MAX,
    },
  ]);
  return "response" in result ? result : { indicatorType: result.normalized };
}
