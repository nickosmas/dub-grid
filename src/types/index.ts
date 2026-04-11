// ── App Domain Types ──────────────────────────────────────────────────────────

/** Controls how shifts are displayed on the schedule grid. */
export type ShiftDisplayMode = 'code' | 'name';

/** A named entity with a full name and abbreviation (certifications & roles). */
export interface NamedItem {
  id: number;
  orgId: string;
  name: string;
  abbr: string;
  sortOrder: number;
  /** FK to departments.id. Null = org-wide (not scoped to any department). */
  departmentId?: number | null;
  /** Non-null when the item has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  phone: string;
  employeeCount: number | null;
  /** Custom display label for focus areas (e.g. "Wings", "Departments"). Defaults to "Focus Areas". */
  focusAreaLabel: string;
  /** Custom display label for certifications/skill levels (e.g. "Skill Levels"). Defaults to "Certifications". */
  certificationLabel: string;
  /** Custom display label for roles (e.g. "Responsibilities"). Defaults to "Roles". */
  roleLabel: string;
  /** Custom display label for departments (e.g. "Teams"). Defaults to "Departments". */
  departmentLabel: string;
  /** Controls grid display: 'code' shows short labels (D, EVE), 'name' shows full names (Day Shift, Evening). */
  shiftDisplayMode: ShiftDisplayMode;
  /** IANA timezone for this organization, e.g. "America/New_York". Null = not set. */
  timezone: string | null;
  /** Non-null when the organization has been archived (soft-deleted). */
  archivedAt?: string | null;
  /** Non-null when the organization is suspended. Members are blocked from the app. */
  suspendedAt?: string | null;
  /** Reason for suspension, set by gridmaster. */
  suspendedReason?: string | null;
  /** When true, shift overlap warnings become blocking — save is disabled until conflicts are resolved. */
  enforceConflictPrevention: boolean;
  /** Stripe customer ID for billing. */
  stripeCustomerId?: string | null;
  /** Stripe subscription status: trialing, active, past_due, canceled, unpaid. */
  subscriptionStatus?: string | null;
  /** Trial expiry timestamp. */
  trialEndsAt?: string | null;
  /** Number of subscription seats from Stripe. */
  subscriptionSeats?: number | null;
  /** Number of days to retain archived/deleted data before permanent purge. */
  dataRetentionDays: number;
  /** Per-org feature flag overrides. Keys are flag names, values are booleans. */
  featureOverrides: Record<string, boolean>;
}


export type DepartmentType = 'scheduled' | 'management';

export interface Department {
  id: number;
  orgId: string;
  name: string;
  abbr: string;
  type: DepartmentType;
  sortOrder: number;
  archivedAt?: string | null;
  /** Permission template for management departments. Null for scheduled departments. */
  permissions?: AdminPermissions | null;
}

export interface FocusArea {
  id: number;
  orgId: string;
  /** Parent scheduled department. Null if not yet assigned. */
  departmentId: number | null;
  name: string;
  sortOrder: number;
  /** Non-null when the focus area has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ShiftCategory {
  id: number;
  orgId: string;
  name: string;
  /** Tally row accent color */
  color: string;
  /** Optional time window start, e.g. "07:00" */
  startTime?: string | null;
  /** Optional time window end, e.g. "15:30" */
  endTime?: string | null;
  sortOrder: number;
  /** FK to focus_areas.id. NULL = global category (for general/off-day codes). */
  focusAreaId?: number | null;
  /** Break duration in minutes. Overrides focus area default. NULL = inherit from focus area. */
  breakMinutes?: number | null;
  /** Non-null when the category has been archived (soft-deleted). */
  archivedAt?: string | null;
}

/**
 * Minimum staffing requirement for a focus area + shift code + day of week.
 * When dayOfWeek is null, the requirement applies to all 7 days ("every day" mode).
 */
export interface CoverageRequirement {
  id: number;
  orgId: string;
  focusAreaId: number;
  shiftCodeId: number;
  /** 0=Sun..6=Sat. Null = applies to every day. */
  dayOfWeek: number | null;
  /** Minimum headcount required. */
  minStaff: number;
}

/**
 * Computed coverage status for a single (focus_area, shift_code, date) cell.
 */
export interface CoverageStatus {
  /** Actual headcount assigned on this date in this section. */
  actual: number;
  /** Required headcount from coverage_requirements. */
  required: number;
  /** True when actual >= required. */
  isMet: boolean;
  /** True when there is a requirement defined (required > 0). */
  hasRequirement: boolean;
}

/**
 * A coverage gap: a (focus_area, shift_code, date) tuple where requirements are not met.
 */
export interface CoverageGap {
  focusAreaId: number;
  focusAreaName: string;
  shiftCodeId: number;
  shiftCodeLabel: string;
  shiftCategoryId: number;
  shiftCategoryName: string;
  date: Date;
  status: CoverageStatus;
}

/**
 * A shift code: the atomic grid-cell entry (e.g. "D", "EVE", "N", "OFF").
 * The `label` field is what is displayed in the schedule grid.
 */
export interface ShiftCode {
  id: number;
  orgId: string;
  label: string;
  name: string;
  color: string;
  border: string;   // mapped from border_color
  text: string;     // mapped from text_color
  /** FK to shift_categories.id — determines which tally bucket this shift counts toward */
  categoryId?: number | null;
  isGeneral?: boolean;
  /** Focus area this code belongs to. null = global (no focus area association). */
  focusAreaId?: number | null;
  sortOrder: number;
  /** Certification IDs eligible for this shift. Empty array = no restriction. */
  requiredCertificationIds?: number[];
  /** Default start time for this shift code, e.g. "07:00" */
  defaultStartTime?: string | null;
  /** Default end time for this shift code, e.g. "15:30" */
  defaultEndTime?: string | null;
  /** Default duration hours (used when no fixed start/end times, e.g. general codes). */
  defaultDurationHours?: number | null;
  /** Default duration minutes (0-59, combined with hours for total duration). */
  defaultDurationMinutes?: number | null;
  /** Non-null when the shift code has been archived (soft-deleted). */
  archivedAt?: string | null;
}

/**
 * An absence type: off-day definitions (Off, Sick, Vacation, etc.).
 * Separate from shift codes — an absence is the absence of a shift, not a type of shift.
 */
export interface AbsenceType {
  id: number;
  orgId: string;
  label: string;    // "X", "V", "S"
  name: string;     // "Off", "Vacation", "Sick"
  color: string;
  border: string;
  text: string;
  sortOrder: number;
  archivedAt?: string | null;
}

export type EmployeeStatus = 'active' | 'benched' | 'terminated';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  /** Current employment status: active (working), benched (temporarily away), terminated (left). */
  status: EmployeeStatus;
  /** When the status was last changed. */
  statusChangedAt: string | null;
  /** Optional note explaining the status (e.g. "On maternity leave until June"). */
  statusNote: string;
  certificationId: number | null;
  roleIds: number[];
  seniority: number;
  focusAreaIds: number[];
  phone: string;
  email: string;
  contactNotes: string;
  archivedAt?: string | null;
  /** Linked Supabase auth user ID. Null if no account linked. */
  userId: string | null;
  /** Management department IDs (explicit assignment for non-schedule departments). */
  departmentIds: number[];
  /** Subset of departmentIds where this employee is a dept admin (gets dept permission template). */
  deptAdminIds: number[];
  /** Optimistic concurrency control version counter. */
  version: number;
}

export type DraftKind = 'new' | 'modified' | 'deleted' | null;

export interface PublishChange {
  empId: string;
  date: string;
  kind: 'new' | 'modified' | 'deleted';
  from: number[];
  to: number[];
  fromAbsenceTypeId?: number | null;
  toAbsenceTypeId?: number | null;
  updatedBy?: string | null;
  fromCustomStart?: string | null;
  fromCustomEnd?: string | null;
  toCustomStart?: string | null;
  toCustomEnd?: string | null;
}

export interface PublishHistoryEntry {
  id: string;
  publishedBy: string;
  startDate: string;
  endDate: string;
  changeCount: number;
  changes: PublishChange[];
  publishedAt: string;
}

export interface PublishHistoryEntryWithName extends PublishHistoryEntry {
  publishedByName: string;
}

export type ShiftMap = Record<string, {
  label: string;
  shiftCodeIds: number[];
  isDraft: boolean;
  isDelete?: boolean;
  /** Classification of the draft change type. null = no draft. */
  draftKind: DraftKind;
  /** Published shift code IDs (empty array if never published). */
  publishedShiftCodeIds: number[];
  /** Resolved label of published version (empty if never published). */
  publishedLabel: string;
  seriesId?: string | null;
  fromRecurring?: boolean;
  /** Effective custom start time (draft for schedulers, published for staff). */
  customStartTime?: string | null;
  /** Effective custom end time (draft for schedulers, published for staff). */
  customEndTime?: string | null;
  /** Published custom start time (used for diff display). */
  publishedCustomStartTime?: string | null;
  /** Published custom end time (used for diff display). */
  publishedCustomEndTime?: string | null;
  /** Draft absence type ID (mutually exclusive with shiftCodeIds). */
  absenceTypeId?: number | null;
  /** Published absence type ID. */
  publishedAbsenceTypeId?: number | null;
  /** Optimistic lock version. undefined for new (not-yet-persisted) shifts. */
  version?: number;
  /** UUID of the user who created this shift. */
  createdBy?: string | null;
  /** UUID of the user who last updated this shift. */
  updatedBy?: string | null;
  /** Timestamp when the shift was created. */
  createdAt?: string | null;
  /** Timestamp when the shift was last updated. */
  updatedAt?: string | null;
}>;

export type SeriesFrequency = 'daily' | 'weekly' | 'biweekly';
export type SeriesScope = 'this' | 'all';

export interface RecurringShift {
  id: string;
  empId: string;
  orgId: string;
  /** 0 = Sunday, 1 = Monday … 6 = Saturday */
  dayOfWeek: number;
  /** FK to shift_codes. Null when this is an absence-type recurring shift. */
  shiftCodeId: number | null;
  /** FK to absence_types. Null when this is a shift-code recurring shift. */
  absenceTypeId: number | null;
  /** Resolved display label from either shiftCodeId or absenceTypeId. */
  shiftLabel: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
  /** Non-null when the recurring shift has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ShiftSeries {
  id: string;
  empId: string;
  orgId: string;
  shiftCodeId: number | null;
  /** FK to absence_types. Null when this is a shift-code series. */
  absenceTypeId: number | null;
  shiftLabel: string;
  frequency: SeriesFrequency;
  /** Day-of-week numbers for weekly/biweekly. Null means every day. */
  daysOfWeek: number[] | null;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  createdAt: string;
  updatedAt: string;
  /** Non-null when the shift series has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface EditModalState {
  empId: string;
  empName: string;
  date: Date;
  empFocusAreaIds: number[];
  empCertificationId: number | null;
  /** The focus area section the cell was clicked in */
  activeFocusAreaId?: number | null;
  /** When true, panel shows only the calloff absence type picker */
  calloffMode?: boolean;
}

export interface IndicatorType {
  id: number;
  orgId: string;
  name: string;
  color: string;
  sortOrder: number;
  /** Non-null when the indicator type has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ScheduleNote {
  id: number;
  orgId: string;
  empId: string;
  date: string;
  /** FK to indicator_types.id — consistent with how shifts reference shift_codes by ID */
  indicatorTypeId: number;
  focusAreaId: number | null;
  status: 'published' | 'draft' | 'draft_deleted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── RBAC Types ────────────────────────────────────────────────────────────────

export type PlatformRole = 'gridmaster' | 'none';
/**
 * super_admin: organization owner — full org management
 * admin: configurable permissions assigned by super_admin
 * user: read-only staff
 */
export type OrganizationRole = 'super_admin' | 'admin' | 'user';
/** Roles assignable via invitation (super_admin assignable by gridmaster during org setup). */
export type AssignableOrganizationRole = 'super_admin' | 'admin' | 'user';

/**
 * Fine-grained permissions for admin users. Stored as JSONB in organization_memberships.admin_permissions.
 * super_admin and gridmaster always have all permissions regardless of this field.
 * Null/undefined = all false for admin users.
 */
export interface AdminPermissions {
  // Schedule
  /** View the schedule grid (always true for all authenticated users) */
  canViewSchedule: boolean;
  /** Create / edit / delete shifts in the draft schedule */
  canEditShifts: boolean;
  /** Publish or discard the draft schedule */
  canPublishSchedule: boolean;
  /** Apply recurring shift templates to a date range */
  canApplyRecurringSchedule: boolean;
  // Notes & Indicators
  /** Add / edit / delete schedule notes (indicators) */
  canEditNotes: boolean;
  // Recurring Shifts
  /** View recurring shift templates (read-only). Implied by canManageRecurringShifts. */
  canViewRecurringShifts: boolean;
  /** Create / edit / delete recurring shift templates */
  canManageRecurringShifts: boolean;
  /** Create / edit / delete shift series */
  canManageShiftSeries: boolean;
  // Staff
  /** View employee list and profiles (always true for all authenticated users) */
  canViewStaff: boolean;
  /** View employee detail panel — profile, contact info, certifications. Implied by canManageEmployees. */
  canViewEmployeeDetails: boolean;
  /** Add / edit / delete employee records */
  canManageEmployees: boolean;
  // Organization Configuration
  /** View departments / focus areas settings (read-only). Implied by canManageFocusAreas. */
  canViewFocusAreas: boolean;
  /** Add / edit / delete focus areas (departments) */
  canManageFocusAreas: boolean;
  /** View shift code definitions (read-only). Implied by canManageShiftCodes. */
  canViewShiftCodes: boolean;
  /** Add / edit / delete shift code definitions */
  canManageShiftCodes: boolean;
  /** View indicator type configuration (read-only). Implied by canManageIndicatorTypes. */
  canViewIndicatorTypes: boolean;
  /** Add / edit / delete indicator / note type definitions */
  canManageIndicatorTypes: boolean;
  /** Edit organization name, address, phone, employee count, timezone (super_admin only) */
  canManageOrgSettings: boolean;
  /** View custom terminology labels (read-only). Implied by canManageOrgLabels. */
  canViewOrgLabels: boolean;
  /** Edit custom terminology labels — focus areas, certifications, roles (delegatable to admin) */
  canManageOrgLabels: boolean;
  // Coverage
  /** View coverage requirements (read-only). Implied by canManageCoverageRequirements. */
  canViewCoverageRequirements: boolean;
  /** Create / edit / delete coverage requirements for shift staffing minimums */
  canManageCoverageRequirements: boolean;
  // Shift Requests
  /** Approve or reject employee shift pickup/swap requests */
  canApproveShiftRequests: boolean;
  // Dashboard
  /** View dashboard analytics and statistics cards */
  canViewDashboardAnalytics: boolean;
}

export interface Profile {
  id: string;
  orgId: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: PlatformRole;
  version: number;
  roleLocked: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: number;
  orgId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  status: string;
  priceId: string | null;
  quantity: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  trialEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An organization user record for the user management panel. */
export interface OrganizationUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  orgRole: OrganizationRole;
  platformRole: PlatformRole;
  adminPermissions: AdminPermissions | null;
  createdAt: string;
  lastSignInAt: string | null;
  departmentIds: number[];
  deptAdminIds: number[];
}

/** A unified person record for the People Directory (union of employees + management staff + pending invites). */
export interface DirectoryPerson {
  personId: string;
  source: 'employee' | 'user_only' | 'pending_invite';
  employeeId: string | null;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeStatus: EmployeeStatus | null;
  orgRole: OrganizationRole | null;
  hasAppAccess: boolean;
  focusAreaIds: number[];
  certificationId: number | null;
  roleIds: number[];
  seniority: number | null;
  lastSignInAt: string | null;
  invitationStatus: 'pending' | 'expired' | null;
  departmentIds: number[];
  deptAdminIds: number[];
}

export interface UserSession {
  id: string;
  userId: string;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  refreshTokenHash: string;
}

export interface ImpersonationSession {
  sessionId: string;
  gridmasterId: string;
  targetUserId: string;
  targetOrgId: string;
  /** Mandatory reason for why the impersonation was started. */
  justification: string;
  /** IP address of the gridmaster at session start. */
  ipAddress: string | null;
  /** User agent of the gridmaster at session start. */
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export interface ImpersonationHistoryEntry {
  sessionId: string;
  gridmasterId: string;
  gridmasterEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetOrgId: string;
  targetOrgName: string | null;
  /** Mandatory reason for why the impersonation was started. */
  justification: string;
  /** IP address of the gridmaster at session start. */
  ipAddress: string | null;
  /** User agent of the gridmaster at session start. */
  userAgent: string | null;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  expiresAt: string;
}

export type NotificationType =
  | 'impersonation_start'
  | 'impersonation_end'
  | 'system'
  | 'shift_change'
  | 'schedule_published'
  | 'shift_request_new'
  | 'shift_request_approved'
  | 'shift_request_rejected';

export interface Notification {
  id: string;
  type: NotificationType;
  channel: 'in_app' | 'email';
  category: string | null;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  /** Per-category toggles: { "shift_change": { in_app: true, email: true }, ... } */
  [category: string]: { in_app: boolean; email: boolean };
}

export interface Invitation {
  id: string;
  orgId: string;
  invitedBy: string | null;
  email: string;
  roleToAssign: AssignableOrganizationRole;
  /** Only present when creating an invitation — never returned by list queries. */
  token?: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Employee record this invitation is for. Null if not linked to an employee. */
  employeeId: string | null;
}

export interface UserClaims {
  userId: string;
  email: string | null;
  orgId: string | null;
  orgSlug: string | null;
}

// ── Staff Detail / Report Types ──────────────────────────────────────────────

/** Weekly hours summary for a single week in the hours history chart. */
export interface WeeklyHoursSummary {
  weekStart: string;
  weekLabel: string;
  totalHours: number;
  shiftCount: number;
  overtimeHours: number;
  isOvertime: boolean;
}

/** Distribution of shift codes for a single employee. */
export interface ShiftDistributionEntry {
  shiftCodeId: number;
  label: string;
  name: string;
  count: number;
  percentage: number;
  color: string;
}

/** Day-of-week work pattern entry. */
export interface DayPatternEntry {
  day: string;
  dayIndex: number;
  count: number;
  percentage: number;
}

/** Focus area time distribution entry. */
export interface FocusAreaDistributionEntry {
  focusAreaId: number;
  name: string;
  shiftCount: number;
  percentage: number;
}

// ── Gridmaster Portal Types ──────────────────────────────────────────────────

/** A platform-wide user view for the gridmaster all-users table. */
export interface PlatformUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  platformRole: PlatformRole;
  orgRole: OrganizationRole | null;
  orgId: string | null;
  orgName: string | null;
  orgSlug: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  deactivatedAt: string | null;
}

/** An audit log entry from the role_change_log table, denormalized with user emails. */
export interface AuditLogEntry {
  id: string;
  targetUserId: string;
  targetEmail: string | null;
  changedById: string;
  changedByEmail: string | null;
  fromRole: string;
  toRole: string;
  createdAt: string;
  orgId: string | null;
  orgName: string | null;
}

/** A comprehensive audit log entry from the audit_log table. */
export interface FullAuditLogEntry {
  id: number;
  orgId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

/** An organization membership row with denormalized user info for display. */
export interface OrganizationMembership {
  id: number;
  userId: string;
  orgId: string;
  orgRole: OrganizationRole;
  adminPermissions: AdminPermissions | null;
  joinedAt: string;
  onboardingCompletedAt: string | null;
  tooltipToursCompleted: Record<string, string>;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Org activity metrics for gridmaster dashboard. */
export interface OrgActivityMetrics {
  orgId: string;
  lastLoginAt: string | null;
  activeUsers30d: number;
  shiftsCreated30d: number;
  invitationsPending: number;
  invitationsAccepted30d: number;
}

/** Feature flag override per org. */
export interface FeatureOverride {
  id: string;
  orgId: string;
  flagName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** User's memberships across all orgs (gridmaster user detail view). */
export interface UserMembership {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  orgRole: OrganizationRole;
  joinedAt: string;
  adminPermissions: AdminPermissions | null;
}

// ── Shift Requests ──────────────────────────────────────────────────────────

export type ShiftRequestType = 'pickup' | 'swap' | 'calloff';
export type ShiftRequestStatus = 'open' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface ShiftRequest {
  id: string;
  orgId: string;
  type: ShiftRequestType;
  status: ShiftRequestStatus;
  requesterEmpId: string;
  requesterName: string;
  requesterShiftDate: string;
  requesterShiftCodeIds: number[];
  requesterShiftLabel: string;
  requesterFocusAreaId: number | null;
  requesterCustomStartTime: string | null;
  requesterCustomEndTime: string | null;
  targetEmpId: string | null;
  targetName: string | null;
  targetShiftDate: string | null;
  targetShiftCodeIds: number[] | null;
  targetShiftLabel: string | null;
  targetFocusAreaId: number | null;
  targetCustomStartTime: string | null;
  targetCustomEndTime: string | null;
  absenceTypeId: number | null;
  parentRequestId: string | null;
  adminUserId: string | null;
  adminNote: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Grid Open Shifts ────────────────────────────────────────────────────────

export interface GridOpenShift {
  id: string;
  source: 'calloff' | 'coverage_gap';
  date: string;
  focusAreaId: number;
  shiftCodeIds: number[];
  shiftCodeLabel: string;
  customStartTime: string | null;
  customEndTime: string | null;
  calledOffBy?: string;
  requestId?: string;
  /** Number of staff still needed for this open shift. */
  needed?: number;
}
