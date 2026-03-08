export type Section = string; // dynamic from DB (wings table)

// ── App Domain Types ──────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  phone: string;
  employeeCount: number | null;
  /** Ordered list of skill levels (designations) for this org. */
  skillLevels: string[];
  /** Ordered list of roles for this org. */
  roles: string[];
}

export interface Wing {
  id: number;
  orgId: string;
  name: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
}

export interface ShiftType {
  id: number;
  orgId: string;
  label: string;
  name: string;
  color: string;
  border: string;   // mapped from border_color
  text: string;     // mapped from text_color
  countsTowardDay?: boolean;
  countsTowardEve?: boolean;
  countsTowardNight?: boolean;
  isOrientation?: boolean;
  isGeneral?: boolean;
  wingName?: string | null;
  sortOrder: number;
  /** Designations eligible for this shift. Empty array = no restriction. */
  requiredDesignations?: string[];
}

export interface Employee {
  id: string;
  name: string;
  designation: string;
  roles: string[];
  fteWeight: number;
  seniority: number;
  wings: Section[];
  phone: string;
  email: string;
  contactNotes: string;
}

export type ShiftMap = Record<string, { label: string; isDraft: boolean }>;

export interface EditModalState {
  empId: string;
  empName: string;
  date: Date;
  empWings: Section[];
  empDesignation: string;
}

export type NoteType = 'readings' | 'shower';

export interface ScheduleNote {
  id: number;
  orgId: string;
  empId: string;
  date: string;
  noteType: NoteType;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── RBAC Types ────────────────────────────────────────────────────────────────

export type PlatformRole = 'gridmaster' | 'none';
export type OrgRole = 'admin' | 'scheduler' | 'supervisor' | 'user';
// Roles that can be assigned via invitation. Admins are assigned directly
// (not via invite), matching the org_invitations DB CHECK constraint.
export type InvitableOrgRole = 'scheduler' | 'supervisor' | 'user';

export interface Profile {
  id: string;
  orgId: string;
  firstName: string | null;
  lastName: string | null;
  orgRole: OrgRole;
  platformRole: PlatformRole;
  version: number;
  roleLocked: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface Invitation {
  id: string;
  orgId: string;
  invitedBy: string;
  email: string;
  roleToAssign: InvitableOrgRole;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
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
  targetOrgId: string;
  expiresAt: string;
  createdAt: string;
}
