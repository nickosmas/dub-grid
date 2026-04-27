/**
 * Shared test factories for DubGrid test suite.
 * Provides factory functions with sensible defaults + overrides pattern.
 */
import type {
  Employee,
  AssignmentDefinition,
  FocusArea,
  ShiftCategory,
  CoverageRequirement,
  Department,
  AdminPermissions,
} from "@/types";
import type { ImpersonationData } from "@/lib/impersonation";

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    firstName: "Test",
    lastName: "Employee",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    ...overrides,
  };
}

export function makeAssignmentDefinition(overrides: Partial<AssignmentDefinition> = {}): AssignmentDefinition {
  return {
    id: 1,
    orgId: "org1",
    label: "D",
    name: "Day",
    color: "#fff",
    border: "#ccc",
    text: "#000",
    sortOrder: 1,
    categoryId: null,
    ...overrides,
  };
}

export function makeFocusArea(overrides: Partial<FocusArea> = {}): FocusArea {
  return {
    id: 1,
    orgId: "org1",
    departmentId: null,
    name: "ICU",
    sortOrder: 1,
    ...overrides,
  };
}

export function makeShiftCategory(overrides: Partial<ShiftCategory> = {}): ShiftCategory {
  return {
    id: 1,
    orgId: "org1",
    name: "Day",
    color: "#E2E8F0",
    sortOrder: 1,
    ...overrides,
  };
}

export function makeCoverageRequirement(overrides: Partial<CoverageRequirement> = {}): CoverageRequirement {
  return {
    id: 1,
    orgId: "org1",
    focusAreaId: 1,
    jobId: 1,
    preferredShiftId: 1,
    assignmentId: 1,
    dayOfWeek: null,
    minStaff: 3,
    ...overrides,
  };
}

export function makeImpersonationData(overrides: Partial<ImpersonationData> = {}): ImpersonationData {
  return {
    sessionId: "session-1",
    targetUserId: "user-target-1",
    targetOrgId: "org-target-1",
    targetOrgSlug: "acme",
    targetOrgRole: "admin",
    targetEmail: "target@example.com",
    targetOrgName: "Acme Corp",
    justification: "Debugging issue #42",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min from now
    ...overrides,
  };
}

export function makeDepartment(overrides: Partial<Department> = {}): Department {
  return {
    id: 1,
    orgId: "org-1",
    name: "HR",
    abbr: "",
    type: "management",
    sortOrder: 0,
    archivedAt: null,
    permissions: null,
    ...overrides,
  };
}

export const ALL_FALSE_PERMS: AdminPermissions = {
  canViewSchedule: false,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRecurringSchedule: false,
  canEditNotes: false,
  canViewRecurringShifts: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: false,
  canViewEmployeeDetails: false,
  canManageEmployees: false,
  canViewFocusAreas: false,
  canManageFocusAreas: false,
  canViewScheduleDefinitions: false,
  canManageScheduleDefinitions: false,
  canViewIndicatorTypes: false,
  canManageIndicatorTypes: false,
  canManageOrgSettings: false,
  canViewOrgLabels: false,
  canManageOrgLabels: false,
  canViewCoverageRequirements: false,
  canManageCoverageRequirements: false,
  canApproveShiftRequests: false,
  canViewDashboardAnalytics: false,
};

export function makeJwtClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    platform_role: "none",
    org_role: "admin",
    org_id: "org-1",
    org_slug: "acme",
    sub: "user-1",
    ...overrides,
  };
}
