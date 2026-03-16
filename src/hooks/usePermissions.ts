// src/hooks/usePermissions.ts
import { useEffect, useState } from "react";
import { decodeJwt } from "jose";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { AdminPermissions } from "@/types";

export const ROLE_LEVEL: Record<string, number> = {
  gridmaster: 4,
  super_admin: 3,
  admin: 2,
  user: 0,
};

/** All write/config permissions on — used for gridmaster and super_admin. */
const ALL_PERMS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: true,
  canPublishSchedule: true,
  canApplyRecurringSchedule: true,
  canEditNotes: true,
  canManageRecurringShifts: true,
  canManageShiftSeries: true,
  canViewStaff: true,
  canManageEmployees: true,
  canManageFocusAreas: true,
  canManageShiftCodes: true,
  canManageIndicatorTypes: true,
  canManageOrgSettings: true,
  canManageOrgLabels: true,
};

/** Read-only baseline — used for user role (and admin with no configured perms). */
const READ_ONLY_PERMS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRecurringSchedule: false,
  canEditNotes: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
  canManageEmployees: false,
  canManageFocusAreas: false,
  canManageShiftCodes: false,
  canManageIndicatorTypes: false,
  canManageOrgSettings: false,
  canManageOrgLabels: false,
};

export interface Permissions extends AdminPermissions {
  role: string;
  orgId: string | null;
  level: number;
  isLoading: boolean;
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  /** True if user can access the settings page (has any config-level permission). */
  canManageOrg: boolean;
  /** True if user can invite / change roles of org members (super_admin+ only). */
  canManageUsers: boolean;
  /** True if user can configure per-admin permissions (super_admin+ only). */
  canConfigureAdminPermissions: boolean;
  atLeast: (role: string) => boolean;
}

function buildPerms(
  role: string,
  orgId: string | null,
  isLoading: boolean,
  adminPerms?: AdminPermissions | null,
): Permissions {
  const level = ROLE_LEVEL[role] ?? 0;
  const isGridmaster = level >= 4;
  const isSuperAdmin = level >= 3;

  let p: AdminPermissions;
  if (isGridmaster || isSuperAdmin) {
    p = ALL_PERMS;
  } else if (role === "admin") {
    // Merge configured perms over the read-only baseline; always preserve view flags.
    p = adminPerms
      ? { ...adminPerms, canViewSchedule: true, canViewStaff: true }
      : READ_ONLY_PERMS;
  } else {
    p = READ_ONLY_PERMS;
  }

  const canManageOrg =
    isGridmaster ||
    isSuperAdmin ||
    p.canManageFocusAreas ||
    p.canManageShiftCodes ||
    p.canManageIndicatorTypes ||
    p.canManageOrgSettings ||
    p.canManageOrgLabels;

  return {
    ...p,
    role,
    orgId,
    level,
    isLoading,
    isGridmaster,
    isSuperAdmin,
    canManageOrg,
    canManageUsers: isSuperAdmin || isGridmaster,
    canConfigureAdminPermissions: isSuperAdmin || isGridmaster,
    atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
  };
}

const LOADING_PERMS: Permissions = buildPerms("user", null, true);
LOADING_PERMS.isLoading = true;

const NO_PERMS: Permissions = buildPerms("user", null, false);

/**
 * Extracts the effective role + org from the JWT access token.
 * Custom claims (platform_role, org_role, org_id) are written at the top level
 * of the JWT payload by the custom_access_token_hook.
 */
function extractJwtClaims(accessToken: string): {
  effectiveRole: string;
  orgId: string | null;
} {
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwt(accessToken) as Record<string, unknown>;
  } catch {
    return { effectiveRole: "user", orgId: null };
  }

  const platformRole = payload.platform_role as string | undefined;
  const orgRole = (payload.org_role as string) || "user";
  const orgId = (payload.org_id as string) || null;
  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : orgRole;

  return { effectiveRole, orgId };
}

export function getPermissionsFromSession(session: Session | null): Permissions {
  if (!session?.access_token) return NO_PERMS;
  const { effectiveRole, orgId } = extractJwtClaims(session.access_token);
  // No admin_permissions available from JWT alone — caller must enrich from DB for admin role.
  return buildPerms(effectiveRole, orgId, false);
}

export function usePermissions(): Permissions {
  const [perms, setPerms] = useState<Permissions>(() => ({ ...LOADING_PERMS }));

  useEffect(() => {
    let mounted = true;

    async function loadSession(session: Session | null) {
      if (!mounted) return;

      if (!session?.access_token) {
        if (mounted) setPerms(NO_PERMS);
        return;
      }

      const { effectiveRole, orgId } = extractJwtClaims(session.access_token);

      // gridmaster / super_admin: all perms, no DB query needed.
      if (effectiveRole === "gridmaster" || effectiveRole === "super_admin") {
        if (mounted) setPerms(buildPerms(effectiveRole, orgId, false));
        return;
      }

      // admin: fetch admin_permissions from organization_memberships.
      if (effectiveRole === "admin" && session.user?.id && orgId) {
        const { data } = await supabase
          .from("organization_memberships")
          .select("admin_permissions")
          .eq("user_id", session.user.id)
          .eq("org_id", orgId)
          .single();

        if (mounted) {
          setPerms(buildPerms("admin", orgId, false, data?.admin_permissions ?? null));
        }
        return;
      }

      // user role from JWT — confirm against DB in case token is stale.
      if (session.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id, platform_role")
          .eq("id", session.user.id)
          .single();

        if (mounted && profile) {
          if (profile.platform_role === "gridmaster") {
            setPerms(buildPerms("gridmaster", profile.org_id, false));
            return;
          }

          if (profile.org_id) {
            const { data: membership } = await supabase
              .from("organization_memberships")
              .select("org_role, admin_permissions")
              .eq("user_id", session.user.id)
              .eq("org_id", profile.org_id)
              .single();

            if (mounted && membership) {
              setPerms(buildPerms(
                membership.org_role,
                profile.org_id,
                false,
                membership.admin_permissions ?? null,
              ));
              return;
            }
          }
        }
      }

      if (mounted) setPerms(buildPerms(effectiveRole, orgId, false));
    }

    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        loadSession(session);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      if (event === "INITIAL_SESSION") return;
      setPerms((prev) => ({ ...prev, isLoading: true }));
      loadSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return perms;
}
