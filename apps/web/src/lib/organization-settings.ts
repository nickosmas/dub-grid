import type { Organization, ShiftDisplayMode } from "@/types";
import type { OpenShiftVisibility, OpenShiftVisibilityMode } from "@dubgrid/domain";
import { DEFAULT_OPEN_SHIFT_VISIBILITY } from "@dubgrid/domain";
import { formatTimezoneLabel } from "@/lib/timezones";

export type OrganizationSettingsKey =
  | "name"
  | "phone"
  | "addressLine1"
  | "addressLine2"
  | "addressCity"
  | "addressState"
  | "addressPostalCode"
  | "addressCountry"
  | "timezone"
  | "focusAreaLabel"
  | "certificationLabel"
  | "roleLabel"
  | "departmentLabel"
  | "shiftDisplayMode"
  | "enforceConflictPrevention"
  | "coverageRuleConfig"
  | "openShiftVisibility"
  | "payPeriodStartDate"
  | "dataRetentionDays"
  | "featureOverrides";

type OrganizationSettingsValue =
  | string
  | number
  | boolean
  | null
  | { mentoredCoverageCreditPercent: number }
  | OpenShiftVisibility
  | Record<string, boolean | number | string>;

export type OrganizationSettingsEditable = Pick<Organization, OrganizationSettingsKey>;

export interface OrganizationSettingsChange {
  key: OrganizationSettingsKey;
  label: string;
  previousValue: OrganizationSettingsValue;
  nextValue: OrganizationSettingsValue;
  previousDisplay: string;
  nextDisplay: string;
  sensitive: boolean;
}

type FieldDescriptor = {
  label: string;
  sensitive: boolean;
  format?: (value: OrganizationSettingsValue) => string;
};

const SHIFT_DISPLAY_MODE_LABELS: Record<ShiftDisplayMode, string> = {
  code: "Short Codes",
  name: "Full Names",
};

const DEFAULT_EMPTY = "Not set";

const OPEN_SHIFT_VISIBILITY_MODE_LABELS: Record<OpenShiftVisibilityMode, string> = {
  hidden: "Hidden",
  matched: "When it fits availability",
  always: "Always",
};

const FIELD_DESCRIPTORS: Record<OrganizationSettingsKey, FieldDescriptor> = {
  name: { label: "Organization Name", sensitive: true },
  phone: { label: "Phone", sensitive: false },
  addressLine1: { label: "Address Line 1", sensitive: true },
  addressLine2: { label: "Address Line 2", sensitive: true },
  addressCity: { label: "City", sensitive: true },
  addressState: { label: "State / Province", sensitive: true },
  addressPostalCode: { label: "Postal Code", sensitive: true },
  addressCountry: { label: "Country", sensitive: true },
  timezone: {
    label: "Time Zone",
    sensitive: true,
    format: (value) =>
      typeof value === "string" && value
        ? `${formatTimezoneLabel(value)} · ${value}`
        : DEFAULT_EMPTY,
  },
  focusAreaLabel: { label: "Focus Areas Label", sensitive: false },
  certificationLabel: { label: "Certifications Label", sensitive: false },
  roleLabel: { label: "Roles Label", sensitive: false },
  departmentLabel: { label: "Scheduled Departments Label", sensitive: false },
  shiftDisplayMode: {
    label: "Shift Display Mode",
    sensitive: false,
    format: (value) =>
      value === "code" || value === "name" ? SHIFT_DISPLAY_MODE_LABELS[value] : DEFAULT_EMPTY,
  },
  payPeriodStartDate: {
    label: "Pay Period Start Date",
    sensitive: true,
  },
  enforceConflictPrevention: {
    label: "Conflict Prevention",
    sensitive: true,
    format: (value) => (value ? "Enabled" : "Disabled"),
  },
  coverageRuleConfig: {
    label: "Coverage Rules",
    sensitive: true,
    format: (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "mentoredCoverageCreditPercent" in value
        ? `Mentored coverage: ${Number(value.mentoredCoverageCreditPercent ?? 100)}%`
        : DEFAULT_EMPTY,
  },
  openShiftVisibility: {
    label: "Open Shift Visibility",
    sensitive: true,
    format: (value) => formatOpenShiftVisibility(value),
  },
  dataRetentionDays: {
    label: "Data Retention",
    sensitive: true,
    format: (value) => (typeof value === "number" ? `${value} days` : DEFAULT_EMPTY),
  },
  featureOverrides: {
    label: "Runtime Controls",
    sensitive: true,
    format: (value) => formatFeatureOverrides(value),
  },
};

const EDITABLE_KEYS = Object.keys(FIELD_DESCRIPTORS) as OrganizationSettingsKey[];

export function pickOrganizationSettings(organization: Organization): OrganizationSettingsEditable {
  return {
    name: organization.name,
    phone: organization.phone,
    addressLine1: organization.addressLine1,
    addressLine2: organization.addressLine2,
    addressCity: organization.addressCity,
    addressState: organization.addressState,
    addressPostalCode: organization.addressPostalCode,
    addressCountry: organization.addressCountry,
    timezone: organization.timezone,
    focusAreaLabel: organization.focusAreaLabel,
    certificationLabel: organization.certificationLabel,
    roleLabel: organization.roleLabel,
    departmentLabel: organization.departmentLabel,
    shiftDisplayMode: organization.shiftDisplayMode,
    enforceConflictPrevention: organization.enforceConflictPrevention,
    coverageRuleConfig: organization.coverageRuleConfig ?? { mentoredCoverageCreditPercent: 100 },
    openShiftVisibility: organization.openShiftVisibility ?? DEFAULT_OPEN_SHIFT_VISIBILITY,
    payPeriodStartDate: organization.payPeriodStartDate,
    dataRetentionDays: organization.dataRetentionDays,
    featureOverrides: organization.featureOverrides ?? {},
  };
}

function normalizeValue(value: OrganizationSettingsValue): OrganizationSettingsValue {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort()
        .map(([key, entry]) => {
          if (typeof entry === "number" || typeof entry === "string") {
            return [key, entry];
          }
          return [key, Boolean(entry)];
        }),
    );
  }
  return value ?? null;
}

function valuesEqual(left: OrganizationSettingsValue, right: OrganizationSettingsValue): boolean {
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  return left === right;
}

function defaultFormat(value: OrganizationSettingsValue): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  return typeof value === "string" && value ? value : DEFAULT_EMPTY;
}

function isOpenShiftVisibility(value: OrganizationSettingsValue): value is OpenShiftVisibility {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "coverageGap" in value &&
    "calloff" in value
  );
}

function formatOpenShiftVisibility(value: OrganizationSettingsValue): string {
  if (!isOpenShiftVisibility(value)) return DEFAULT_EMPTY;
  return `Coverage shortages: ${OPEN_SHIFT_VISIBILITY_MODE_LABELS[value.coverageGap]} · Call-offs: ${OPEN_SHIFT_VISIBILITY_MODE_LABELS[value.calloff]}`;
}

function formatFeatureOverrides(value: OrganizationSettingsValue): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "No overrides";
  }

  const enabledFlags = Object.entries(value)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (enabledFlags.length === 0) return "No enabled overrides";
  if (enabledFlags.length <= 3) return enabledFlags.join(", ");
  return `${enabledFlags.length} enabled overrides`;
}

export function formatOrganizationSettingsValue(
  key: OrganizationSettingsKey,
  value: OrganizationSettingsValue,
): string {
  const descriptor = FIELD_DESCRIPTORS[key];
  return descriptor.format?.(value) ?? defaultFormat(value);
}

export function buildOrganizationSettingsChanges(
  previous: OrganizationSettingsEditable,
  next: OrganizationSettingsEditable,
): OrganizationSettingsChange[] {
  return EDITABLE_KEYS.flatMap((key) => {
    const previousValue = normalizeValue(previous[key] ?? null);
    const nextValue = normalizeValue(next[key] ?? null);

    if (valuesEqual(previousValue, nextValue)) return [];

    const descriptor = FIELD_DESCRIPTORS[key];
    return [
      {
        key,
        label: descriptor.label,
        previousValue,
        nextValue,
        previousDisplay: formatOrganizationSettingsValue(key, previousValue),
        nextDisplay: formatOrganizationSettingsValue(key, nextValue),
        sensitive: descriptor.sensitive,
      },
    ];
  });
}
