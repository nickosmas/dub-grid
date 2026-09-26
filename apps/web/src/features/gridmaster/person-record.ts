import type { AdminPermissions } from "@dubgrid/domain";
import type { OrganizationTerminology } from "@/lib/db/mappers";
import type { Employee, Invitation, OrganizationRole } from "@/types";

export interface GridmasterPersonAccount {
  userId: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
}

export interface GridmasterPersonProfile {
  firstName: string | null;
  lastName: string | null;
  platformRole: string;
  mfaEnabled: boolean;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  scheduledDeletionAt: string | null;
  deactivationWarnedAt: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  terminatedAt: string | null;
  terminatedBy: string | null;
  terminatedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GridmasterTermsAcceptance {
  version: string;
  acceptedAt: string;
  userAgent: string | null;
}

export interface GridmasterCookieConsent {
  version: string | null;
  consent: Record<string, boolean>;
  createdAt: string;
  userAgent: string | null;
}

export interface GridmasterLiveImpersonation {
  gridmasterId: string;
  orgId: string;
  startedAt: string;
  expiresAt: string;
}

export interface GridmasterLoginLock {
  locked: boolean;
  resetsAt: string | null;
}

export interface GridmasterMembership {
  id: string;
  orgRole: OrganizationRole;
  adminPermissions: AdminPermissions | null;
  joinedAt: string;
  scheduleLastViewedAt: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  departmentIds: number[];
  deptAdminIds: number[];
  phone: string | null;
  onboardingCompletedAt: string | null;
  tooltipToursCompleted: Record<string, unknown>;
  updatedAt: string | null;
}

export type GridmasterStaffRecord = Employee & {
  orgId: string;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

/** Names for the ids a membership or staff record carries, archived ones included. */
export interface GridmasterOrganizationNames {
  departments: Record<number, string>;
  focusAreas: Record<number, string>;
  roles: Record<number, string>;
  certifications: Record<number, string>;
}

export interface GridmasterPersonOrganization {
  org: { id: string; name: string; slug: string | null };
  terminology: OrganizationTerminology;
  names: GridmasterOrganizationNames;
  membership: GridmasterMembership | null;
  employees: GridmasterStaffRecord[];
  invitations: Invitation[];
}

/**
 * Everything a Gridmaster may see about one person. Secrets (tokens, IP
 * addresses and IP hashes) never enter it. Actor columns hold user ids;
 * `actors` resolves the ones it can to an email. 43c to 43e extend it.
 */
export interface GridmasterPersonRecord {
  account: GridmasterPersonAccount | null;
  profile: GridmasterPersonProfile | null;
  termsAcceptances: GridmasterTermsAcceptance[];
  cookieConsents: GridmasterCookieConsent[];
  liveImpersonation: GridmasterLiveImpersonation | null;
  loginLock: GridmasterLoginLock | null;
  organizations: GridmasterPersonOrganization[];
  actors: Record<string, string>;
}
