export type ShiftDisplayMode = "code" | "name";
export type WorkspaceKind = "real" | "sandbox";

export interface CoverageRuleConfig {
  mentoredCoverageCreditPercent: number;
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
  timezone: string | null;
  payPeriodStartDate: string | null;
  archivedAt?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  workspaceKind: WorkspaceKind;
  sandboxOwnerUserId: string | null;
  sandboxSourceOrgId: string | null;
  enforceConflictPrevention: boolean;
  coverageRuleConfig?: CoverageRuleConfig;
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  subscriptionSeats?: number | null;
  dataRetentionDays: number;
  featureOverrides: Record<string, boolean>;
  updatedAt?: string | null;
}
