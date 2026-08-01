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
  departmentId: z.number().int().nullable().optional(),
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

export function validateNamedItems(
  items: NamedItemInput[],
  args: { itemLabel: string },
): { items: NamedItemInput[] } | { response: NextResponse } {
  const fieldErrors: Record<string, string | null> = {};
  const draftItems = items.map((item, index) => {
    const nameError = validateSettingsTextField({
      value: item.name,
      label: `${args.itemLabel} name`,
      maxLength: SETTINGS_NAME_MAX,
      required: true,
    });
    const abbrError =
      item.abbr.trim().length > 0
        ? getCodeError(item.abbr, {
            label: `${args.itemLabel} abbreviation`,
            maxLength: SETTINGS_ABBR_MAX,
          })
        : null;
    fieldErrors[`items.${index}.name`] = nameError;
    fieldErrors[`items.${index}.abbr`] = abbrError;

    return item;
  });

  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return {
      response: buildSettingsValidationResponse({
        error: firstFieldError,
        fieldErrors,
      }),
    };
  }

  const normalizedItems = draftItems.map((item) => ({
    ...item,
    name: normalizeSettingsTextField({
      value: item.name,
      label: `${args.itemLabel} name`,
      maxLength: SETTINGS_NAME_MAX,
      required: true,
    }),
    abbr:
      item.abbr.trim().length > 0
        ? normalizeCode(item.abbr, {
            label: `${args.itemLabel} abbreviation`,
            maxLength: SETTINGS_ABBR_MAX,
          })
        : "",
  }));

  const duplicateName = findDuplicateValue(normalizedItems.map((item) => item.name.toLowerCase()));
  if (duplicateName) {
    return {
      response: buildSettingsValidationResponse({
        error: `Duplicate ${args.itemLabel.toLowerCase()} name: "${duplicateName}"`,
        fieldErrors,
      }),
    };
  }

  return { items: normalizedItems };
}

export function validateDepartments(
  items: DepartmentInput[],
): { items: DepartmentInput[] } | { response: NextResponse } {
  const fieldErrors: Record<string, string | null> = {};
  const draftItems = items.map((item, index) => {
    const nameError = validateSettingsTextField({
      value: item.name,
      label: "Department name",
      maxLength: SETTINGS_NAME_MAX,
      required: true,
    });
    const abbrError =
      item.abbr.trim().length > 0
        ? getCodeError(item.abbr, {
            label: "Department abbreviation",
            maxLength: SETTINGS_ABBR_MAX,
          })
        : null;
    fieldErrors[`items.${index}.name`] = nameError;
    fieldErrors[`items.${index}.abbr`] = abbrError;

    return item;
  });

  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return {
      response: buildSettingsValidationResponse({
        error: firstFieldError,
        fieldErrors,
      }),
    };
  }

  const normalizedItems = draftItems.map((item) => ({
    ...item,
    name: normalizeSettingsTextField({
      value: item.name,
      label: "Department name",
      maxLength: SETTINGS_NAME_MAX,
      required: true,
    }),
    abbr:
      item.abbr.trim().length > 0
        ? normalizeCode(item.abbr, {
            label: "Department abbreviation",
            maxLength: SETTINGS_ABBR_MAX,
          })
        : "",
  }));

  for (const type of ["scheduled", "management"] as const) {
    const duplicateName = findDuplicateValue(
      normalizedItems.filter((item) => item.type === type).map((item) => item.name.toLowerCase()),
    );
    if (duplicateName) {
      return {
        response: buildSettingsValidationResponse({
          error: `Duplicate department name: "${duplicateName}"`,
          fieldErrors,
        }),
      };
    }
  }

  return { items: normalizedItems };
}

export function validateFocusArea(
  focusArea: FocusAreaInput,
): { focusArea: FocusAreaInput } | { response: NextResponse } {
  const nameError = validateSettingsTextField({
    value: focusArea.name,
    label: "Focus area name",
    maxLength: FOCUS_AREA_NAME_MAX,
    required: true,
  });
  if (nameError) {
    return {
      response: buildSettingsValidationResponse({
        error: nameError,
        fieldErrors: {
          "focusArea.name": nameError,
        },
      }),
    };
  }

  return {
    focusArea: {
      ...focusArea,
      name: normalizeSettingsTextField({
        value: focusArea.name,
        label: "Focus area name",
        maxLength: FOCUS_AREA_NAME_MAX,
        required: true,
      }),
    },
  };
}

export function validateShiftCategory(
  shiftCategory: ShiftCategoryInput,
): { shiftCategory: ShiftCategoryInput } | { response: NextResponse } {
  const nameError = validateSettingsTextField({
    value: shiftCategory.name,
    label: "Shift name",
    maxLength: SHIFT_CATEGORY_NAME_MAX,
    required: true,
  });
  const abbrError = shiftCategory.abbr?.trim()
    ? getCodeError(shiftCategory.abbr, {
        label: "Shift code",
        maxLength: SHIFT_CATEGORY_ABBR_MAX,
        uppercase: true,
      })
    : null;
  const fieldErrors = {
    "shiftCategory.name": nameError,
    "shiftCategory.abbr": abbrError,
  };
  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return {
      response: buildSettingsValidationResponse({
        error: firstFieldError,
        fieldErrors,
      }),
    };
  }

  return {
    shiftCategory: {
      ...shiftCategory,
      name: normalizeSettingsTextField({
        value: shiftCategory.name,
        label: "Shift name",
        maxLength: SHIFT_CATEGORY_NAME_MAX,
        required: true,
      }),
      abbr: shiftCategory.abbr?.trim()
        ? normalizeCode(shiftCategory.abbr, {
            label: "Shift code",
            maxLength: SHIFT_CATEGORY_ABBR_MAX,
            uppercase: true,
          })
        : null,
    },
  };
}

export function validateJob(job: JobInput): { job: JobInput } | { response: NextResponse } {
  const nameError = validateSettingsTextField({
    value: job.name,
    label: "Job name",
    maxLength: JOB_NAME_MAX,
    required: true,
  });
  const abbrError = getCodeError(job.abbr, {
    label: "Job abbreviation",
    maxLength: JOB_ABBR_MAX,
    required: true,
    uppercase: true,
  });
  const fieldErrors = {
    "job.name": nameError,
    "job.abbr": abbrError,
  };
  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return {
      response: buildSettingsValidationResponse({
        error: firstFieldError,
        fieldErrors,
      }),
    };
  }

  return {
    job: {
      ...job,
      name: normalizeSettingsTextField({
        value: job.name,
        label: "Job name",
        maxLength: JOB_NAME_MAX,
        required: true,
      }),
      abbr: normalizeCode(job.abbr, {
        label: "Job abbreviation",
        maxLength: JOB_ABBR_MAX,
        required: true,
        uppercase: true,
      }),
    },
  };
}

export function validateAbsenceType(
  absenceType: AbsenceTypeInput,
): { absenceType: AbsenceTypeInput } | { response: NextResponse } {
  const labelError =
    absenceType.label.trim().length > 0
      ? getCodeError(absenceType.label, {
          label: "Absence code",
          maxLength: ABSENCE_LABEL_MAX,
          uppercase: true,
        })
      : null;
  const nameError = validateSettingsTextField({
    value: absenceType.name,
    label: "Absence name",
    maxLength: ABSENCE_NAME_MAX,
    required: true,
  });
  const fieldErrors = {
    "absenceType.label": labelError,
    "absenceType.name": nameError,
  };
  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return {
      response: buildSettingsValidationResponse({
        error: firstFieldError,
        fieldErrors,
      }),
    };
  }

  return {
    absenceType: {
      ...absenceType,
      label:
        absenceType.label.trim().length > 0
          ? normalizeCode(absenceType.label, {
              label: "Absence code",
              maxLength: ABSENCE_LABEL_MAX,
              uppercase: true,
            })
          : "",
      name: normalizeSettingsTextField({
        value: absenceType.name,
        label: "Absence name",
        maxLength: ABSENCE_NAME_MAX,
        required: true,
      }),
    },
  };
}

export function validateIndicatorType(
  indicatorType: IndicatorTypeInput,
): { indicatorType: IndicatorTypeInput } | { response: NextResponse } {
  const nameError = validateSettingsTextField({
    value: indicatorType.name,
    label: "Indicator name",
    maxLength: INDICATOR_NAME_MAX,
    required: true,
  });
  if (nameError) {
    return {
      response: buildSettingsValidationResponse({
        error: nameError,
        fieldErrors: {
          "indicatorType.name": nameError,
        },
      }),
    };
  }

  return {
    indicatorType: {
      ...indicatorType,
      name: normalizeSettingsTextField({
        value: indicatorType.name,
        label: "Indicator name",
        maxLength: INDICATOR_NAME_MAX,
        required: true,
      }),
    },
  };
}
