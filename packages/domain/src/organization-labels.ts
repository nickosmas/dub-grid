/** What each configurable organization label reads when the organization hasn't chosen one. */
export const DEFAULT_ORGANIZATION_LABELS = {
  focusArea: "Areas",
  department: "Departments",
  certification: "Certifications",
  role: "Roles",
} as const;

export type OrganizationLabelKey = keyof typeof DEFAULT_ORGANIZATION_LABELS;

/** A stored label, or the product default when there is none. */
export function resolveOrganizationLabel(
  key: OrganizationLabelKey,
  stored: string | null | undefined,
): string {
  return stored?.trim() || DEFAULT_ORGANIZATION_LABELS[key];
}

/**
 * The value to store for a submitted label. Blank or the current default stores
 * null, so the organization follows the product default if it changes later.
 * An earlier default someone types on purpose is kept as their choice.
 */
export function storedOrganizationLabel(
  key: OrganizationLabelKey,
  submitted: string | null | undefined,
): string | null {
  const label = submitted?.trim() ?? "";
  if (!label) return null;
  return label.toLowerCase() === DEFAULT_ORGANIZATION_LABELS[key].toLowerCase() ? null : label;
}

/**
 * What the groups of people who aren't scheduled are called, on every
 * platform. Always spelled out, never shortened (owner, 2026-11-02).
 */
export const ADMINISTRATIVE_TEAM_LABELS = {
  plural: "Administrative Teams",
  pluralLower: "administrative teams",
  singularLower: "administrative team",
} as const;

/** Examples shown under each editable label's field. The first is the default. */
export const ORGANIZATION_LABEL_EXAMPLES = {
  focusArea: ["Areas", "Units", "Wings", "Halls", "Floors", "Neighborhoods", "Locations"],
  certification: [
    "Certifications",
    "Credentials",
    "Licenses",
    "Qualifications",
    "Designations",
    "Skill Levels",
    "Training",
  ],
  role: ["Roles", "Positions", "Responsibilities", "Duties", "Titles"],
} as const;

export type EditableOrganizationLabelKey = keyof typeof ORGANIZATION_LABEL_EXAMPLES;

/** The hint line under a label's field, such as "e.g. Roles, Positions, Duties". */
export function organizationLabelHint(key: EditableOrganizationLabelKey): string {
  return `e.g. ${ORGANIZATION_LABEL_EXAMPLES[key].join(", ")}`;
}
