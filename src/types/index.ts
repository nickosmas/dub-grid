// ── App Domain Types ──────────────────────────────────────────────────────────

/** A named entity with a full name and abbreviation (certifications & roles). */
export interface NamedItem {
  id: number;
  companyId: string;
  name: string;
  abbr: string;
  sortOrder: number;
  /** Non-null when the item has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface Company {
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
  /** IANA timezone for this company, e.g. "America/New_York". Null = not set. */
  timezone: string | null;
  /** Non-null when the company has been archived (soft-deleted). */
  archivedAt?: string | null;
}


export interface FocusArea {
  id: number;
  companyId: string;
  name: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
  /** Non-null when the focus area has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ShiftCategory {
  id: number;
  companyId: string;
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
  /** Non-null when the category has been archived (soft-deleted). */
  archivedAt?: string | null;
}

/**
 * A shift code: the atomic grid-cell entry (e.g. "D", "EVE", "N", "OFF").
 * The `label` field is what is displayed in the schedule grid.
 */
export interface ShiftCode {
  id: number;
  companyId: string;
  label: string;
  name: string;
  color: string;
  border: string;   // mapped from border_color
  text: string;     // mapped from text_color
  /** FK to shift_categories.id — determines which tally bucket this shift counts toward */
  categoryId?: number | null;
  isGeneral?: boolean;
  /** True if this is an off-day code (Off, Sick, Vacation, etc.) */
  isOffDay?: boolean;
  /** Focus area this code belongs to. null = global (no focus area association). */
  focusAreaId?: number | null;
  sortOrder: number;
  /** Certification IDs eligible for this shift. Empty array = no restriction. */
  requiredCertificationIds?: number[];
  /** Default start time for this shift code, e.g. "07:00" */
  defaultStartTime?: string | null;
  /** Default end time for this shift code, e.g. "15:30" */
  defaultEndTime?: string | null;
  /** Non-null when the shift code has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export type EmployeeStatus = 'active' | 'benched' | 'terminated';

export interface Employee {
  id: string;
  name: string;
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
}

export type ShiftMap = Record<string, {
  label: string;
  shiftCodeIds: number[];
  isDraft: boolean;
  isDelete?: boolean;
  seriesId?: string | null;
  fromRegular?: boolean;
  customStartTime?: string | null;
  customEndTime?: string | null;
}>;

export type SeriesFrequency = 'daily' | 'weekly' | 'biweekly';
export type SeriesScope = 'this' | 'all';

export interface RegularShift {
  id: string;
  empId: string;
  companyId: string;
  /** 0 = Sunday, 1 = Monday … 6 = Saturday */
  dayOfWeek: number;
  shiftCodeId: number;
  shiftLabel: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
  /** Non-null when the regular shift has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ShiftSeries {
  id: string;
  empId: string;
  companyId: string;
  shiftCodeId: number;
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
}

/** Dynamic indicator name — matches indicator_types.name in the DB */
export type NoteType = string;

export interface IndicatorType {
  id: number;
  companyId: string;
  name: string;
  color: string;
  sortOrder: number;
  /** Non-null when the indicator type has been archived (soft-deleted). */
  archivedAt?: string | null;
}

export interface ScheduleNote {
  id: number;
  companyId: string;
  empId: string;
  date: string;
  noteType: NoteType;
  focusAreaId: number | null;
  status: 'published' | 'draft' | 'draft_deleted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── RBAC Types ────────────────────────────────────────────────────────────────

export type PlatformRole = 'gridmaster' | 'none';
/**
 * super_admin: company owner — full company management
 * admin: configurable permissions assigned by super_admin
 * user: read-only staff
 */
export type CompanyRole = 'super_admin' | 'admin' | 'user';
/** Roles assignable by super_admin from the user management panel. */
export type AssignableCompanyRole = 'admin' | 'user';

/**
 * Fine-grained permissions for admin users. Stored as JSONB in company_memberships.admin_permissions.
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
  /** Apply regular shift templates to a date range */
  canApplyRegularSchedule: boolean;
  // Notes & Indicators
  /** Add / edit / delete schedule notes (indicators) */
  canEditNotes: boolean;
  // Recurring Shifts
  /** Create / edit / delete regular (recurring) shift templates */
  canManageRegularShifts: boolean;
  /** Create / edit / delete shift series */
  canManageShiftSeries: boolean;
  // Staff
  /** View employee list and profiles (always true for all authenticated users) */
  canViewStaff: boolean;
  /** Add / edit / delete employee records */
  canManageEmployees: boolean;
  // Company Configuration
  /** Add / edit / delete focus areas (departments) */
  canManageFocusAreas: boolean;
  /** Add / edit / delete shift code definitions */
  canManageShiftCodes: boolean;
  /** Add / edit / delete indicator / note type definitions */
  canManageIndicatorTypes: boolean;
  /** Edit company name, address, labels, certifications, roles */
  canManageCompanySettings: boolean;
}

export interface Profile {
  id: string;
  companyId: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: PlatformRole;
  version: number;
  roleLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A company user record for the user management panel. */
export interface CompanyUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  companyRole: CompanyRole;
  platformRole: PlatformRole;
  adminPermissions: AdminPermissions | null;
  createdAt: string;
}

export interface RoleChangeLog {
  id: string;
  targetUserId: string;
  changedById: string;
  fromRole: string;
  toRole: string;
  idempotencyKey: string;
  createdAt: string;
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
  targetCompanyId: string;
  expiresAt: string;
  createdAt: string;
}

export interface UserClaims {
  userId: string;
  email: string | null;
  companyId: string | null;
  companySlug: string | null;
}

// ── Gridmaster Portal Types ──────────────────────────────────────────────────

/** A platform-wide user view for the gridmaster all-users table. */
export interface PlatformUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  platformRole: PlatformRole;
  companyRole: CompanyRole | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
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
  companyId: string | null;
  companyName: string | null;
}

/** A company membership row with denormalized user info for display. */
export interface CompanyMembership {
  id: number;
  userId: string;
  companyId: string;
  companyRole: CompanyRole;
  adminPermissions: AdminPermissions | null;
  joinedAt: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}
