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
  updatedAt: string;
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

export interface GridmasterFactor {
  id: string;
  type: string;
  name: string | null;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface GridmasterKnownDevice {
  id: string;
  platform: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface GridmasterPersonSecurity {
  twoFactor: {
    enabled: boolean;
    reenrollRequiredAt: string | null;
    factors: GridmasterFactor[];
  };
  knownDevices: GridmasterKnownDevice[];
}

export interface GridmasterSession {
  id: string;
  orgId: string | null;
  platform: string | null;
  deviceLabel: string | null;
  browser: string | null;
  appVersion: string | null;
  location: string | null;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface GridmasterPushDevice {
  id: string;
  orgId: string | null;
  platform: string;
  lastSeenAt: string | null;
  disabledAt: string | null;
  createdAt: string;
}

export interface GridmasterCalendarFeed {
  id: string;
  orgId: string;
  issuedAt: string;
  revokedAt: string | null;
}

export interface GridmasterPersonSessions {
  sessions: GridmasterSession[];
  pushDevices: GridmasterPushDevice[];
  calendarFeeds: GridmasterCalendarFeed[];
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
  /** Null for a staff record with no account. */
  security: GridmasterPersonSecurity | null;
  sessions: GridmasterPersonSessions | null;
  organizations: GridmasterPersonOrganization[];
  actors: Record<string, string>;
}

/** A staff record with no account, found by the cross-organization search. */
export interface GridmasterStaffSearchResult {
  employeeId: string;
  orgId: string;
  orgName: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  archivedAt: string | null;
}

export interface GridmasterRecurringShift {
  id: string;
  dayOfWeek: number;
  label: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  archivedAt: string | null;
}

export interface GridmasterShiftSeries {
  id: string;
  label: string;
  frequency: string;
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  archivedAt: string | null;
}

export interface GridmasterScheduledDay {
  date: string;
  /** Display labels; null when that side has no state, "" for a deleted draft. */
  published: string | null;
  draft: string | null;
  customStart: string | null;
  customEnd: string | null;
  source: "recurring" | "series" | "manual";
  updatedAt: string | null;
}

export interface GridmasterScheduleIndicator {
  date: string;
  name: string;
  status: "published" | "draft" | "draft_deleted";
}

export interface GridmasterPublishChange {
  publishedAt: string;
  date: string;
  kind: string;
  from: string | null;
  to: string | null;
  publishedBy: string | null;
}

export interface GridmasterShiftRequest {
  id: string;
  type: "pickup" | "swap" | "calloff";
  status: string;
  side: "requester" | "target";
  partner: string | null;
  shiftDate: string | null;
  partnerShiftDate: string | null;
  adminNote: string | null;
  settledBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface GridmasterProfileChangeRequest {
  id: string;
  type: string;
  status: string;
  requested: Record<string, unknown>;
  note: string | null;
  resolverNote: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * One staff record's work in its organization, loaded on demand. Read by 43e's
 * timeline too, so the shape is load-bearing. Actor ids resolve through `actors`.
 */
export interface GridmasterPersonSchedule {
  window: { from: string; to: string };
  recurring: GridmasterRecurringShift[];
  series: GridmasterShiftSeries[];
  shifts: GridmasterScheduledDay[];
  indicators: GridmasterScheduleIndicator[];
  publishChanges: GridmasterPublishChange[];
  shiftRequests: GridmasterShiftRequest[];
  profileChangeRequests: GridmasterProfileChangeRequest[];
  actors: Record<string, string>;
}

export interface GridmasterNotification {
  id: string;
  orgId: string | null;
  type: string;
  channel: string | null;
  category: string | null;
  priority: string | null;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

/** An account's stored notification preferences and its latest notifications. */
export interface GridmasterPersonNotifications {
  /** Null when the person has never saved a preference. */
  preferences: Record<string, unknown> | null;
  notifications: GridmasterNotification[];
}
