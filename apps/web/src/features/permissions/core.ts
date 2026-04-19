import type { AdminPermissions } from "@/types";

export const ROLE_LEVEL: Record<string, number> = {
  gridmaster: 4,
  super_admin: 3,
  admin: 2,
  user: 0,
};

const ALL_PERMS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: true,
  canPublishSchedule: true,
  canApplyRecurringSchedule: true,
  canEditNotes: true,
  canViewRecurringShifts: true,
  canManageRecurringShifts: true,
  canManageShiftSeries: true,
  canViewStaff: true,
  canViewEmployeeDetails: true,
  canManageEmployees: true,
  canViewFocusAreas: true,
  canManageFocusAreas: true,
  canViewShiftCodes: true,
  canManageShiftCodes: true,
  canViewIndicatorTypes: true,
  canManageIndicatorTypes: true,
  canManageOrgSettings: true,
  canViewOrgLabels: true,
  canManageOrgLabels: true,
  canViewCoverageRequirements: true,
  canManageCoverageRequirements: true,
  canApproveShiftRequests: true,
  canViewDashboardAnalytics: true,
};

export const READ_ONLY_PERMS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRecurringSchedule: false,
  canEditNotes: false,
  canViewRecurringShifts: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
  canViewEmployeeDetails: false,
  canManageEmployees: false,
  canViewFocusAreas: false,
  canManageFocusAreas: false,
  canViewShiftCodes: false,
  canManageShiftCodes: false,
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

export function applyViewImplications(
  permissions: AdminPermissions,
): AdminPermissions {
  const result = { ...permissions };
  result.canViewEmployeeDetails =
    result.canViewEmployeeDetails || result.canManageEmployees;
  result.canViewFocusAreas =
    result.canViewFocusAreas || result.canManageFocusAreas;
  result.canViewShiftCodes =
    result.canViewShiftCodes || result.canManageShiftCodes;
  result.canViewIndicatorTypes =
    result.canViewIndicatorTypes || result.canManageIndicatorTypes;
  result.canViewCoverageRequirements =
    result.canViewCoverageRequirements || result.canManageCoverageRequirements;
  result.canViewRecurringShifts =
    result.canViewRecurringShifts || result.canManageRecurringShifts;
  result.canViewOrgLabels =
    result.canViewOrgLabels || result.canManageOrgLabels;
  result.canViewDashboardAnalytics =
    result.canViewDashboardAnalytics ||
    result.canEditShifts ||
    result.canManageEmployees ||
    result.canPublishSchedule ||
    result.canApproveShiftRequests;
  return result;
}

export function unionPermissions(
  permissionSets: AdminPermissions[],
): AdminPermissions {
  const result: AdminPermissions = { ...READ_ONLY_PERMS };
  for (const permissions of permissionSets) {
    for (const key of Object.keys(result) as (keyof AdminPermissions)[]) {
      result[key] = result[key] || Boolean(permissions[key]);
    }
  }
  result.canManageOrgSettings = false;
  return result;
}

export interface PermissionContext extends AdminPermissions {
  role: string;
  orgId: string | null;
  level: number;
  isLoading: boolean;
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  isImpersonating: boolean;
  isUserViewActive: boolean;
  actualLevel: number;
  canManageOrg: boolean;
  canAccessSettings: boolean;
  canManageUsers: boolean;
  canConfigureAdminPermissions: boolean;
}

export function buildPermissionContext(
  role: string,
  orgId: string | null,
  adminPerms?: AdminPermissions | null,
  options?: {
    isImpersonating?: boolean;
    isLoading?: boolean;
  },
): PermissionContext {
  const isImpersonating = options?.isImpersonating ?? false;
  const isLoading = options?.isLoading ?? false;
  const level = ROLE_LEVEL[role] ?? 0;
  const isGridmaster = level >= 4;
  const isSuperAdmin = level >= 3;

  let permissions: AdminPermissions;
  if (isGridmaster || isSuperAdmin) {
    permissions = ALL_PERMS;
  } else if (role === "admin") {
    permissions = adminPerms
      ? { ...adminPerms, canViewSchedule: true }
      : READ_ONLY_PERMS;
  } else if (role === "user") {
    permissions = adminPerms
      ? {
          ...adminPerms,
          canViewSchedule: true,
          canViewStaff: true,
          canManageOrgSettings: false,
        }
      : { ...READ_ONLY_PERMS };
  } else {
    permissions = READ_ONLY_PERMS;
  }

  if (isImpersonating) {
    permissions = {
      ...permissions,
      canManageEmployees: false,
      canManageOrgSettings: false,
      canManageOrgLabels: false,
      canManageFocusAreas: false,
      canManageShiftCodes: false,
      canManageIndicatorTypes: false,
      canManageCoverageRequirements: false,
      canApproveShiftRequests: false,
    };
  }

  permissions = applyViewImplications(permissions);

  const canManageOrg =
    isGridmaster ||
    isSuperAdmin ||
    permissions.canManageFocusAreas ||
    permissions.canManageShiftCodes ||
    permissions.canManageIndicatorTypes ||
    permissions.canManageOrgSettings ||
    permissions.canManageOrgLabels ||
    permissions.canManageCoverageRequirements;

  const canAccessSettings =
    canManageOrg ||
    permissions.canViewFocusAreas ||
    permissions.canViewShiftCodes ||
    permissions.canViewIndicatorTypes ||
    permissions.canViewOrgLabels ||
    permissions.canViewCoverageRequirements;

  return {
    ...permissions,
    role,
    orgId,
    level,
    isLoading,
    isGridmaster,
    isSuperAdmin,
    isImpersonating,
    isUserViewActive: false,
    actualLevel: level,
    canManageOrg,
    canAccessSettings,
    canManageUsers: isImpersonating ? false : isSuperAdmin || isGridmaster,
    canConfigureAdminPermissions:
      isImpersonating ? false : isSuperAdmin || isGridmaster,
  };
}
