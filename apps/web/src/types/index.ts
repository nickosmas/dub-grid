import type {
  ResolvedSchedulePresentation as ContractResolvedSchedulePresentation,
  ScheduleCellSegment as ContractScheduleCellSegment,
  ScheduleCellState as ContractScheduleCellState,
} from "@dubgrid/contracts";
import type {
  AdminPermissions,
  AssignableOrganizationRole,
  BillingAccessResult,
  Employee,
  EmployeeEmploymentType,
  EmployeeStatus,
  Organization,
  OrganizationRole,
  PlatformRole,
  ShiftDisplayMode,
  ShiftRequestStatus,
  ShiftRequestType,
} from "@dubgrid/domain";
export type {
  AdminPermissions,
  AssignableOrganizationRole,
  BillingAccessResult,
  Employee,
  EmployeeEmploymentType,
  EmployeeStatus,
  Organization,
  OrganizationRole,
  PlatformRole,
  ShiftDisplayMode,
  ShiftRequestStatus,
  ShiftRequestType,
} from "@dubgrid/domain";

// ── App Domain Types ──────────────────────────────────────────────────────────

/** A named entity with a full name and abbreviation (certifications & roles). */
export interface NamedItem {
  id: number;
  orgId: string;
  name: string;
  abbr: string;
  /** When true, jobs may use this role for eligibility gating. */
  isScheduleRole?: boolean;
  sortOrder: number;
  /** FK to departments.id. Null = org-wide (not scoped to any department). */
  departmentId?: number | null;
  /** Non-null when the item has been archived (soft-deleted). */
  archivedAt?: string | null;
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
  /** Legacy focus-area color retained for existing records. */
  color?: string | null;
  sortOrder: number;
  /** Non-null when the focus area has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ShiftCategory {
  id: number;
  orgId: string;
  name: string;
  /** Short label used when the grid is in code mode, e.g. "D" or "N". */
  abbr?: string | null;
  /** Optional time window start, e.g. "07:00" */
  startTime?: string | null;
  /** Optional time window end, e.g. "15:30" */
  endTime?: string | null;
  /** Preset color inherited by scheduled jobs unless they override this shift. */
  color?: string | null;
  sortOrder: number;
  /** FK to focus_areas.id. NULL = global category (for general/off-day codes). */
  focusAreaId?: number | null;
  /** Break duration in minutes. Overrides focus area default. NULL = inherit from focus area. */
  breakMinutes?: number | null;
  /** Non-null when the category has been archived (soft-deleted). */
  archivedAt?: string | null;
}

/**
 * Minimum staffing requirement for a focus area + assignment pair + day of week.
 * When dayOfWeek is null, the requirement applies to all 7 days ("every day" mode).
 */
export interface CoverageRequirement {
  id: number;
  orgId: string;
  focusAreaId: number;
  jobId?: number | null;
  /** Preferred shift for this requirement. Null for shiftless jobs like Office/Admin work. */
  preferredShiftId?: number | null;
  /** Legacy compatibility field while older helpers/tests still refer to requirement assignments. */
  assignmentId?: number | null;
  /** 0=Sun..6=Sat. Null = applies to every day. */
  dayOfWeek: number | null;
  /** Minimum headcount required. */
  minStaff: number;
}

/**
 * Computed coverage status for a single (focus_area, assignment, date) cell.
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

export interface CoverageShortageDetail {
  assignmentId: number;
  assignmentLabel: string;
  required: number;
  actual: number;
  shortage: number;
}

/**
 * A coverage gap: a (focus_area, shift_category, date) tuple where category
 * staffing totals are not met. Exact-code shortages are carried as detail.
 */
export interface CoverageGap {
  focusAreaId: number;
  focusAreaName: string;
  requirementAssignmentDefinitionId: number;
  assignmentId: number;
  ruleLabel: string;
  assignmentLabel: string;
  eligibleAssignmentDefinitionIds: number[];
  preferredOpenAssignmentDefinitionId: number;
  shiftCategoryId: number;
  shiftCategoryName: string;
  date: Date;
  status: CoverageStatus;
  shortageDetails: CoverageShortageDetail[];
}

/** In-memory schedule option projected from canonical shift + job definitions. */
export interface AssignmentDefinition {
  id: number;
  orgId: string;
  label: string;
  name: string;
  color: string;
  border: string;   // mapped from border_color
  text: string;     // mapped from text_color
  /** FK to shift_categories.id — determines which tally bucket this option counts toward. */
  categoryId?: number | null;
  /** Canonical worked shift for this option. */
  shiftId?: number | null;
  /** Canonical worked job for this option. */
  jobId?: number | null;
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

export type JobAssignmentMode = "with_shift" | "shiftless" | "both";
export type JobEligibilityMode = "and" | "or";

export interface JobShiftTimeOverride {
  startTime: string | null;
  endTime: string | null;
}

export interface JobDefinition {
  id: number;
  orgId: string;
  name: string;
  abbr: string;
  /** Legacy visibility flag retained for compatibility with existing data. */
  showOnGrid: boolean;
  assignmentMode?: JobAssignmentMode;
  eligibilityMode?: JobEligibilityMode;
  /** Legacy convenience field derived from the first saved focus area, when present. */
  focusAreaId?: number | null;
  /** Direct focus areas where this scheduled job may be used. */
  focusAreaIds?: number[];
  /** Scheduled departments whose focus areas this job may be used in. */
  departmentIds?: number[];
  /** Subset of shifts inside the job's effective placement scope. Empty = all shifts in scope. */
  applicableShiftIds?: number[];
  eligibleRoleIds: number[];
  requiredCertificationIds: number[];
  color: string;
  border: string;
  text: string;
  /** Optional per-shift time overrides for scheduled jobs, keyed by shift id. */
  shiftTimeOverrides?: Record<string, JobShiftTimeOverride>;
  /** Optional per-shift color preset overrides for scheduled jobs, keyed by shift id. */
  shiftColorOverrides?: Record<string, string>;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  defaultDurationHours?: number | null;
  defaultDurationMinutes?: number | null;
  sortOrder: number;
  systemKey?: string | null;
  archivedAt?: string | null;
}

export interface AssignableShiftOption {
  /** Stable UI id for the option. */
  id: string;
  /** Stable numeric UI id retained for older picker/coverage components. */
  assignmentId: number;
  shiftId: number | null;
  jobId: number;
  focusAreaId: number | null;
  focusAreaName: string | null;
  shiftName: string | null;
  shiftAbbr: string | null;
  jobName: string;
  jobAbbr: string;
  showJobOnGrid: boolean;
  isShiftless: boolean;
  isShiftOnly: boolean;
  primaryLabel: string;
  secondaryLabel: string | null;
  groupLabel: string;
  groupSortOrder: number;
  sortOrder: number;
  qualificationRank: number | null;
  color: string;
  border: string;
  text: string;
  startTime: string | null;
  endTime: string | null;
}

export interface ShiftDisplayParts {
  primaryLabel: string;
  secondaryLabel: string | null;
  showJobOnGrid: boolean;
  isShiftless: boolean;
  isShiftOnly: boolean;
}

export interface ShiftJobSegment {
  shiftId: number | null;
  jobId: number;
  position?: number;
  /**
   * UI metadata for label/time helpers. Never authoritative schedule identity.
   */
  assignmentId?: number | null;
  label: string;
  shiftName?: string | null;
  shiftAbbr?: string | null;
  jobName?: string | null;
  jobAbbr?: string | null;
  focusAreaId?: number | null;
  showJobOnGrid?: boolean;
  isShiftless?: boolean;
  isShiftOnly?: boolean;
  isMentored?: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export type ScheduleCellKind = "worked" | "absence" | "deleted";

export type ScheduleCellSegmentInput = ContractScheduleCellSegment;

export type ScheduleCellState = ContractScheduleCellState;

export interface ScheduleCellSegmentSnapshot extends ShiftJobSegment {
  position: number;
}

export type ScheduleCellInput = ScheduleCellState;

export type ResolvedSchedulePresentation = ContractResolvedSchedulePresentation;

export interface ScheduleCellSnapshot extends ScheduleCellInput {
  label: string;
  /**
   * UI option IDs for helpers that still need numeric schedule-option metadata.
   * Never persisted as authoritative schedule state.
   */
  assignmentIds: number[];
  segments: ScheduleCellSegmentSnapshot[];
}

export type RecurringScheduleDraft = Record<
  string,
  Record<number, ScheduleCellInput | null>
>;

/**
 * An absence type: off-day definitions (Off, Sick, Vacation, etc.).
 * Separate from worked assignments — an absence is the absence of a shift, not a type of shift.
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

export type DraftKind = 'new' | 'modified' | 'deleted' | null;

export interface PublishChange {
  empId: string;
  date: string;
  kind: 'new' | 'modified' | 'deleted';
  from?: number[];
  to?: number[];
  fromState?: ScheduleCellState | null;
  toState?: ScheduleCellState | null;
  fromSegments?: ShiftJobSegment[];
  toSegments?: ShiftJobSegment[];
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

export interface ScheduleCellStateEntry {
  draft?: ScheduleCellSnapshot | null;
  published?: ScheduleCellSnapshot | null;
  effective?: ScheduleCellSnapshot | null;
  label: string;
  segments?: ShiftJobSegment[];
  assignmentIds: number[];
  isDraft: boolean;
  isDelete?: boolean;
  /** Classification of the draft change type. null = no draft. */
  draftKind: DraftKind;
  /** Published shift code IDs (empty array if never published). */
  publishedAssignmentDefinitionIds: number[];
  publishedSegments?: ShiftJobSegment[];
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
  /** Draft absence type ID (mutually exclusive with assignmentIds). */
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
}

export type ShiftMap = Record<string, ScheduleCellStateEntry>;

export type SeriesFrequency = 'daily' | 'weekly' | 'biweekly';
export type SeriesScope = 'this' | 'all';

export interface RecurringShift {
  id: string;
  empId: string;
  orgId: string;
  /** 0 = Sunday, 1 = Monday … 6 = Saturday */
  dayOfWeek: number;
  state?: ScheduleCellState;
  presentation?: ResolvedSchedulePresentation | null;
  input: ScheduleCellInput;
  /** FK to absence_types. Null when this is a worked recurring template. */
  absenceTypeId: number | null;
  /** Resolved display label from canonical state. */
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
  state?: ScheduleCellState;
  presentation?: ResolvedSchedulePresentation | null;
  input: ScheduleCellInput;
  /** FK to absence_types. Null when this is a worked series. */
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
  empRoleIds: number[];
  /** The focus area section the cell was clicked in */
  activeFocusAreaId?: number | null;
  /** When set, panel opens directly into the selected shift-request flow. */
  requestMode?: "coverage" | "swap";
}

export interface GridCellId {
  empId: string;
  dateKey: string;
  sectionId: number;
}

export interface GridColumnMeta {
  columnIndex: number;
  date: Date;
  dateKey: string;
  isToday: boolean;
  isWeekSplitStart: boolean;
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
  /** FK to indicator_types.id — consistent with how schedule cells reference related config by ID */
  indicatorTypeId: number;
  focusAreaId: number | null;
  status: 'published' | 'draft' | 'draft_deleted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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

export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | string;

export interface BillingOperationSummary {
  id: string;
  action: string;
  label: string;
  actorLabel: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface OrganizationBillingSummary {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  status: BillingSubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  subscriptionSeats: number | null;
  appUserCount: number;
  seatDelta: number | null;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  stripeConfigured: boolean;
  canManageBilling: boolean;
  billingAccess: BillingAccessResult;
  recentOperations?: BillingOperationSummary[];
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
  updatedAt: string | null;
  departmentIds: number[];
  deptAdminIds: number[];
}

export interface NameMismatchDetails {
  employeeId: string | null;
  userId: string;
  employeeFirstName: string;
  employeeLastName: string;
  accountFirstName: string;
  accountLastName: string;
}

export interface NameMismatchResponseBody {
  code: "NAME_MISMATCH";
  error: string;
  details: NameMismatchDetails;
}

/** A unified person record for the People Directory (union of employees + management staff + pending invites). */
export interface DirectoryPerson {
  personId: string;
  source: 'employee' | 'user_only' | 'pending_invite';
  employeeId: string | null;
  /** Per-org employee ID badge. Null for app-only members without an employee
   *  row yet (user_only / pending_invite). */
  employeeNumber: number | null;
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
  /** Scheduled department IDs from the employee record. */
  scheduledDepartmentIds: number[];
  /** Subset of scheduledDepartmentIds where this employee is a dept admin. */
  scheduledDeptAdminIds: number[];
  /** Management department IDs from org membership or pending invitation. */
  managementDepartmentIds: number[];
  /** Subset of managementDepartmentIds where this person is a dept admin. */
  managementDeptAdminIds: number[];
  /** Back-compat alias for managementDepartmentIds. */
  departmentIds: number[];
  /** Back-compat alias for managementDeptAdminIds. */
  deptAdminIds: number[];
  /** True when the person is an active org member with at least one management department. */
  isManagementUser: boolean;
  /** updated_at of the person's org membership, for optimistic-concurrency on
   *  role/permission edits. Null/undefined for pending invites or unlinked staff. */
  membershipUpdatedAt?: string | null;
  /** The member's stored admin_permissions, for the in-directory permission
   *  matrix. Null for super_admin/user roles or pending invites. */
  adminPermissions?: AdminPermissions | null;
}

export interface UserSession {
  id: string;
  userId: string;
  orgId: string | null;
  supabaseSessionId: string | null;
  platform: "web" | "ios" | "android" | null;
  appVersion: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  refreshTokenHash: string;
}

export interface GridmasterUserSessionOrg {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  orgRole: OrganizationRole | null;
}

export interface GridmasterUserSession {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userPlatformRole: PlatformRole | null;
  org: GridmasterUserSessionOrg | null;
  supabaseSessionId: string | null;
  platform: "web" | "ios" | "android" | null;
  appVersion: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  status: "active" | "recent" | "stale";
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
  | 'shift_request_rejected'
  // schedule (non-publish flows)
  | 'recurring_shift_updated'
  | 'shift_series_updated'
  | 'schedule_note_published'
  | 'recurring_schedules_applied'
  // membership lifecycle
  | 'invitation_received'
  | 'invitation_accepted'
  | 'invitation_revoked'
  | 'invitation_resent'
  | 'membership_removed'
  | 'admin_permissions_changed'
  // employee + org account
  | 'employee_created'
  | 'employee_status_changed'
  | 'employee_profile_changed'
  | 'org_settings_changed'
  | 'org_suspended'
  | 'org_unsuspended'
  // billing
  | 'billing_subscription_changed'
  | 'billing_payment_failed'
  | 'billing_payment_succeeded'
  // security
  | 'security_email_changed'
  | 'security_password_changed'
  | 'security_mfa_changed'
  | 'security_new_device'
  | 'security_session_revoked'
  // platform / gridmaster (org lifecycle events, org_id = NULL)
  | 'org_created'
  | 'org_trial_started'
  | 'org_archived'
  | 'org_restored'
  | 'org_subscription_converted'
  | 'org_subscription_canceled'
  | 'org_payment_failed';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Notification {
  id: string;
  type: NotificationType;
  channel: 'in_app' | 'email';
  category: string | null;
  priority: NotificationPriority;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface NotificationFacets {
  totalInbox: number;
  totalUnread: number;
  totalArchived: number;
  byCategory: Record<string, number>;
  byPriority: Record<NotificationPriority, number>;
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
  updatedAt: string | null;
  /** Employee record this invitation is for. Null if not linked to an employee. */
  employeeId: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  departmentIds?: number[];
  deptAdminIds?: number[];
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

/** Distribution of worked assignments for a single employee. */
export interface ShiftDistributionEntry {
  assignmentId: number;
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
  membershipCount?: number;
  activeSessionCount?: number;
  mobileDeviceCount?: number;
  lastForceLogoutAt?: string | null;
}

/** A platform-only gridmaster account view. */
export interface GridmasterAccount {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
}

export interface GridmasterAuditEventSummary {
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

export interface GridmasterActivityCategorySummary {
  category: string;
  count: number;
}

export interface GridmasterOrgActivitySignal {
  orgId: string;
  orgName: string;
  actionCount: number;
  operationalActionCount: number;
  highRiskActionCount: number;
  latestAt: string | null;
  dominantCategory: string | null;
  classification: "normal_operation" | "review_recommended";
  reason: string;
}

export interface GridmasterPlatformActivitySummary {
  last24hCount: number;
  last7dCount: number;
  topCategories: GridmasterActivityCategorySummary[];
  busiestOrganizations: GridmasterOrgActivitySignal[];
  reviewRecommendedOrganizations: GridmasterOrgActivitySignal[];
}

export interface GridmasterImpersonationSummary {
  sessionId: string;
  gridmasterId: string;
  targetUserId: string;
  targetOrgId: string;
  justification: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export interface GridmasterOrgHealthSummary {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  status: "active" | "suspended" | "archived";
  oversightScore: number;
  riskFlags: Array<
    | "suspended"
    | "archived"
    | "setup_incomplete"
    | "no_recent_login"
    | "pending_invites"
    | "open_requests"
    | "billing_risk"
  >;
  setup: {
    isComplete: boolean;
    missing: Array<
      "focusAreas" | "scheduleDefinitions" | "certifications" | "orgRoles"
    >;
  };
  supportSnapshot: {
    userCount: number;
    employeeCount: number;
    activeUsers30d: number;
    activeSessions: number;
    mobileDevices: number;
    pendingInvitations: number;
    openShiftRequests: number;
    scheduleCellsCreated30d: number;
    lastLoginAt: string | null;
    lastSchedulePublishAt: string | null;
    recentSettingsChangeAt: string | null;
  };
  billing: {
    subscriptionStatus: string | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    subscriptionSeats: number | null;
    stripeCustomerId: string | null;
  };
  featureOverrides: Record<string, boolean>;
}

export interface GridmasterOverview {
  generatedAt: string;
  platformHealth: {
    db: { status: "ok" | "error"; checkedAt: string };
    redis: { configured: boolean; productionReady: boolean; message: string | null };
    activeSessionCount: number;
    staleSessionCount: number;
    activeMobileTokenCount: number;
  };
  orgRisk: {
    suspendedCount: number;
    archivedCount: number;
    noLoginCount: number;
    pendingSetupCount: number;
    pendingInvitationCount: number;
    openShiftRequestCount: number;
    riskiestOrganizations: GridmasterOrgHealthSummary[];
  };
  businessHealth: {
    trialEndingCount: number;
    trialsNotStartedCount: number;
    billingRiskCount: number;
    missingStripeCount: number;
    seatMismatchCount: number;
  };
  complianceAlerts: {
    activeImpersonationCount: number;
    expiredUnendedImpersonationCount: number;
    highRiskAuditCount: number;
    dataRetentionRiskCount: number;
    gdprEventCount: number;
  };
  activitySummary: GridmasterPlatformActivitySummary;
  recentHighRiskEvents: GridmasterAuditEventSummary[];
}

export interface GridmasterSecuritySummary {
  generatedAt: string;
  sessionSummary: {
    active24h: number;
    stale30d: number;
    web: number;
    ios: number;
    android: number;
  };
  mobileDeviceSummary: {
    active: number;
    disabled: number;
  };
  impersonation: {
    activeCount: number;
    expiredUnendedCount: number;
    recent: GridmasterImpersonationSummary[];
  };
  forceLogoutEvents: GridmasterAuditEventSummary[];
  highRiskAuditEvents: GridmasterAuditEventSummary[];
}

export interface GridmasterBillingOrgSummary {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  seats: number | null;
  appUsers: number;
  employeeCount: number;
  seatDelta: number | null;
  updatedAt: string | null;
}

export interface GridmasterBillingSummary {
  generatedAt: string;
  organizations: GridmasterBillingOrgSummary[];
  trialEndingSoon: GridmasterBillingOrgSummary[];
  /** Trialing orgs whose clock has not started (no super_admin has signed in). */
  trialsNotStarted: GridmasterBillingOrgSummary[];
  riskOrganizations: GridmasterBillingOrgSummary[];
  missingStripeCustomer: GridmasterBillingOrgSummary[];
  seatMismatches: GridmasterBillingOrgSummary[];
}

export interface GridmasterComplianceSummary {
  generatedAt: string;
  termsAcceptanceCount: number;
  cookieConsentCount: number;
  pendingProfileChangeRequestCount: number;
  dataRetentionRisk: Array<{
    orgId: string;
    orgName: string;
    dataRetentionDays: number;
  }>;
  gdprEvents: GridmasterAuditEventSummary[];
  accountDeletionEvents: GridmasterAuditEventSummary[];
  impersonationEvidence: GridmasterImpersonationSummary[];
  orgRetention: Array<{
    orgId: string;
    orgName: string;
    dataRetentionDays: number;
  }>;
}

export interface GridmasterAuditExportResult {
  exportedAt: string;
  rowCount: number;
  entries: GridmasterAuditEventSummary[];
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
  orgName: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  targetLabel: string | null;
  targetEmail: string | null;
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
  updatedAt: string | null;
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
  updatedAt: string | null;
  adminPermissions: AdminPermissions | null;
}

export interface ShiftRequest {
  id: string;
  orgId: string;
  type: ShiftRequestType;
  status: ShiftRequestStatus;
  requesterEmpId: string;
  requesterName: string;
  requesterShiftDate: string;
  requesterState: ScheduleCellState;
  requesterPresentation?: ResolvedSchedulePresentation | null;
  requesterShiftIds?: Array<number | null>;
  requesterJobIds?: number[];
  requesterSegments?: ShiftJobSegment[];
  /** UI option metadata for display/time helpers only. */
  requesterAssignmentDefinitionIds: number[];
  requesterShiftLabel: string;
  requesterFocusAreaId: number | null;
  requesterCustomStartTime: string | null;
  requesterCustomEndTime: string | null;
  targetEmpId: string | null;
  targetName: string | null;
  targetShiftDate: string | null;
  targetState?: ScheduleCellState | null;
  targetPresentation?: ResolvedSchedulePresentation | null;
  targetShiftIds?: Array<number | null> | null;
  targetJobIds?: number[] | null;
  targetSegments?: ShiftJobSegment[] | null;
  /** UI option metadata for display/time helpers only. */
  targetAssignmentDefinitionIds: number[] | null;
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
  requirementAssignmentDefinitionId?: number;
  shiftIds?: Array<number | null>;
  jobIds?: number[];
  segments?: ShiftJobSegment[];
  assignmentIds: number[];
  eligibleAssignmentDefinitionIds?: number[];
  preferredOpenAssignmentDefinitionId?: number;
  ruleLabel?: string;
  assignmentLabel: string;
  customStartTime: string | null;
  customEndTime: string | null;
  calledOffBy?: string;
  requestId?: string;
  /** Number of staff still needed for this open shift. */
  needed?: number;
}
