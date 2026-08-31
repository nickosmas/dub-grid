export type ShiftDisplayMode = "code" | "name";
export type WorkspaceKind = "real" | "sandbox";

export interface CoverageRuleConfig {
  mentoredCoverageCreditPercent: number;
}

/**
 * How an open-shift source is surfaced to regular users (not editors/admins,
 * who always see every gap as a scheduling tool):
 * - `hidden`: never shown, even when there is a genuine coverage shortage.
 * - `matched`: shown only when the open shift fits the viewing user's own
 *   availability (does not conflict with a shift they already have). This is
 *   the default and matches the legacy behavior.
 * - `always`: shown to every eligible user regardless of their availability.
 *   Still gated to published dates and shifts that have not started, and still
 *   respects hard eligibility (a user with a conflicting shift can't volunteer).
 */
export type OpenShiftVisibilityMode = "hidden" | "matched" | "always";

export const OPEN_SHIFT_VISIBILITY_MODES: readonly OpenShiftVisibilityMode[] = [
  "hidden",
  "matched",
  "always",
];

export interface OpenShiftVisibility {
  /** Open shifts derived from coverage-requirement shortages. */
  coverageGap: OpenShiftVisibilityMode;
  /** Open shifts created when someone calls off (open pickup vacancies). */
  calloff: OpenShiftVisibilityMode;
}

export const DEFAULT_OPEN_SHIFT_VISIBILITY: OpenShiftVisibility = {
  coverageGap: "matched",
  calloff: "matched",
};

function normalizeOpenShiftVisibilityMode(value: unknown): OpenShiftVisibilityMode {
  return value === "hidden" || value === "always" ? value : "matched";
}

/** Coerce an unknown stored value into a complete, valid OpenShiftVisibility. */
export function normalizeOpenShiftVisibility(
  value?: Partial<OpenShiftVisibility> | Record<string, unknown> | null,
): OpenShiftVisibility {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_OPEN_SHIFT_VISIBILITY };
  }
  const record = value as Record<string, unknown>;
  return {
    coverageGap: normalizeOpenShiftVisibilityMode(record.coverageGap),
    calloff: normalizeOpenShiftVisibilityMode(record.calloff),
  };
}

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  phone: string;
  employeeCount: number | null;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  departmentLabel: string;
  shiftDisplayMode: ShiftDisplayMode;
  useCompactRoleCertificationLabels?: boolean;
  /** Whether schedule shift pills reveal their full detail card on hover. */
  showShiftDetailHoverCards?: boolean;
  timezone: string | null;
  payPeriodStartDate: string | null;
  archivedAt?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  workspaceKind: WorkspaceKind;
  sandboxOwnerUserId: string | null;
  sandboxSourceOrgId: string | null;
  enforceConflictPrevention: boolean;
  defaultShiftEnabled: boolean;
  coverageRuleConfig?: CoverageRuleConfig;
  openShiftVisibility: OpenShiftVisibility;
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  trialStartedAt?: string | null;
  subscriptionSeats?: number | null;
  dataRetentionDays: number;
  featureOverrides: Record<string, boolean>;
  updatedAt?: string | null;
}
