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
