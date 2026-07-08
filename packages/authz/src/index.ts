import type { AdminPermissions } from "@dubgrid/domain";
import type { Session } from "@supabase/supabase-js";

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
  canEditScheduleIndicators: true,
  canViewRecurringShifts: true,
  canManageRecurringShifts: true,
  canManageShiftSeries: true,
  canViewStaff: true,
  canViewEmployeeDetails: true,
  canManageEmployees: true,
  canViewFocusAreas: true,
  canManageFocusAreas: true,
  canViewScheduleDefinitions: true,
  canManageScheduleDefinitions: true,
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
  canEditScheduleIndicators: false,
  canViewRecurringShifts: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
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

export function applyViewImplications(permissions: AdminPermissions): AdminPermissions {
  const result = { ...permissions };
  result.canViewEmployeeDetails = result.canViewEmployeeDetails || result.canManageEmployees;
  result.canViewFocusAreas = result.canViewFocusAreas || result.canManageFocusAreas;
  result.canViewScheduleDefinitions =
    result.canViewScheduleDefinitions || result.canManageScheduleDefinitions;
  result.canViewIndicatorTypes = result.canViewIndicatorTypes || result.canManageIndicatorTypes;
  result.canViewCoverageRequirements =
    result.canViewCoverageRequirements || result.canManageCoverageRequirements;
  result.canViewRecurringShifts = result.canViewRecurringShifts || result.canManageRecurringShifts;
  result.canViewOrgLabels = result.canViewOrgLabels || result.canManageOrgLabels;
  result.canViewDashboardAnalytics =
    result.canViewDashboardAnalytics ||
    result.canEditShifts ||
    result.canManageEmployees ||
    result.canPublishSchedule ||
    result.canApproveShiftRequests;
  return result;
}

export function unionPermissions(permissionSets: AdminPermissions[]): AdminPermissions {
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
  isInactive: boolean;
  actualLevel: number;
  canManageOrg: boolean;
  canAccessSettings: boolean;
  canManageUsers: boolean;
  canConfigureAdminPermissions: boolean;
}

export interface Permissions extends PermissionContext {
  atLeast: (role: string) => boolean;
}

export function buildPermissionContext(
  role: string,
  orgId: string | null,
  adminPerms?: AdminPermissions | null,
  options?: {
    isImpersonating?: boolean;
    isLoading?: boolean;
    isInactive?: boolean;
  },
): PermissionContext {
  const isImpersonating = options?.isImpersonating ?? false;
  const isLoading = options?.isLoading ?? false;
  const isInactive = options?.isInactive ?? false;
  const actualLevel = ROLE_LEVEL[role] ?? 0;

  // Inactive employees are temporarily sidelined — strip them to read-only
  // regardless of their underlying org_role. They still see their schedule and
  // staff list (canViewSchedule + canViewStaff stay true per READ_ONLY_PERMS)
  // but lose every manage capability + admin perms JSONB grants. Mirror the
  // User-View override: collapse level/role/flags so atLeast() checks fail.
  if (isInactive) {
    return {
      ...READ_ONLY_PERMS,
      role: "user",
      orgId,
      level: 0,
      isLoading,
      isGridmaster: false,
      isSuperAdmin: false,
      isImpersonating: false,
      isUserViewActive: false,
      isInactive: true,
      actualLevel,
      canManageOrg: false,
      canAccessSettings: false,
      canManageUsers: false,
      canConfigureAdminPermissions: false,
    };
  }

  const level = actualLevel;
  const isGridmaster = level >= 4;
  const isSuperAdmin = level >= 3;

  let permissions: AdminPermissions;
  if (isGridmaster || isSuperAdmin) {
    permissions = ALL_PERMS;
  } else if (role === "admin") {
    permissions = adminPerms ? { ...adminPerms, canViewSchedule: true } : READ_ONLY_PERMS;
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
      canManageScheduleDefinitions: false,
      canManageIndicatorTypes: false,
      canManageCoverageRequirements: false,
      canApproveShiftRequests: false,
      canEditScheduleIndicators: false,
    };
  }

  permissions = applyViewImplications(permissions);

  const canManageOrg =
    isGridmaster ||
    isSuperAdmin ||
    permissions.canManageFocusAreas ||
    permissions.canManageScheduleDefinitions ||
    permissions.canManageIndicatorTypes ||
    permissions.canManageOrgSettings ||
    permissions.canManageOrgLabels ||
    permissions.canManageCoverageRequirements;

  const canAccessSettings =
    canManageOrg ||
    permissions.canViewFocusAreas ||
    permissions.canViewScheduleDefinitions ||
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
    isInactive: false,
    actualLevel: level,
    canManageOrg,
    canAccessSettings,
    canManageUsers: isImpersonating ? false : isSuperAdmin || isGridmaster,
    canConfigureAdminPermissions: isImpersonating ? false : isSuperAdmin || isGridmaster,
  };
}

export function buildPerms(
  role: string,
  orgId: string | null,
  isLoading: boolean,
  adminPerms?: AdminPermissions | null,
  isImpersonating = false,
  isInactive = false,
): Permissions {
  const base = buildPermissionContext(role, orgId, adminPerms, {
    isImpersonating,
    isLoading,
    isInactive,
  });
  return {
    ...base,
    atLeast: (nextRole: string) => base.level >= (ROLE_LEVEL[nextRole] ?? 0),
  };
}

function decodeBase64UrlSegment(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const padded = `${normalized}${padding}`;

  if (typeof atob === "function") {
    return atob(padded);
  }

  const bufferCtor = (
    globalThis as {
      Buffer?: {
        from: (
          value: string,
          encoding: string,
        ) => {
          toString: (encoding: string) => string;
        };
      };
    }
  ).Buffer;

  if (bufferCtor) {
    return bufferCtor.from(padded, "base64").toString("utf8");
  }

  throw new Error("No base64url decoder is available in this runtime.");
}

export function extractJwtClaims(accessToken: string): {
  effectiveRole: string;
  orgId: string | null;
} {
  let payload: Record<string, unknown>;
  try {
    const [, encodedPayload] = accessToken.split(".");
    if (!encodedPayload) {
      throw new Error("Missing JWT payload segment");
    }

    payload = JSON.parse(decodeBase64UrlSegment(encodedPayload)) as Record<string, unknown>;
  } catch {
    return { effectiveRole: "user", orgId: null };
  }

  const platformRole = payload.platform_role as string | undefined;
  const orgRole = (payload.org_role as string) || "user";
  const orgId = (payload.org_id as string) || null;
  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : orgRole;

  return { effectiveRole, orgId };
}

const NO_PERMS: Permissions = buildPerms("user", null, false);

export function getPermissionsFromSession(session: Session | null): Permissions {
  if (!session?.access_token) return NO_PERMS;
  const { effectiveRole, orgId } = extractJwtClaims(session.access_token);
  return buildPerms(effectiveRole, orgId, false);
}
