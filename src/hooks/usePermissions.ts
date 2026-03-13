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
  canApplyRegularSchedule: true,
  canEditNotes: true,
  canManageRegularShifts: true,
  canManageShiftSeries: true,
  canViewStaff: true,
  canManageEmployees: true,
  canManageFocusAreas: true,
  canManageShiftCodes: true,
  canManageIndicatorTypes: true,
  canManageCompanySettings: true,
};

/** Read-only baseline — used for user role (and admin with no configured perms). */
const READ_ONLY_PERMS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRegularSchedule: false,
  canEditNotes: false,
  canManageRegularShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
  canManageEmployees: false,
  canManageFocusAreas: false,
  canManageShiftCodes: false,
  canManageIndicatorTypes: false,
  canManageCompanySettings: false,
};

export interface Permissions extends AdminPermissions {
  role: string;
  companyId: string | null;
  level: number;
  isLoading: boolean;
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  /** True if user can access the settings page (has any config-level permission). */
  canManageCompany: boolean;
  /** True if user can invite / change roles of company members (super_admin+ only). */
  canManageUsers: boolean;
  /** True if user can configure per-admin permissions (super_admin+ only). */
  canConfigureAdminPermissions: boolean;
  atLeast: (role: string) => boolean;
}

function buildPerms(
  role: string,
  companyId: string | null,
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

  const canManageCompany =
    isGridmaster ||
    isSuperAdmin ||
    p.canManageFocusAreas ||
    p.canManageShiftCodes ||
    p.canManageIndicatorTypes ||
    p.canManageCompanySettings;

  return {
    ...p,
    role,
    companyId,
    level,
    isLoading,
    isGridmaster,
    isSuperAdmin,
    canManageCompany,
    canManageUsers: isSuperAdmin || isGridmaster,
    canConfigureAdminPermissions: isSuperAdmin || isGridmaster,
    atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
  };
}

const LOADING_PERMS: Permissions = buildPerms("user", null, true);
LOADING_PERMS.isLoading = true;

const NO_PERMS: Permissions = buildPerms("user", null, false);

/**
 * Extracts the effective role + company from the JWT access token.
 * Custom claims (platform_role, company_role, company_id) are written at the top level
 * of the JWT payload by the custom_access_token_hook.
 */
function extractJwtClaims(accessToken: string): {
  effectiveRole: string;
  companyId: string | null;
} {
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwt(accessToken) as Record<string, unknown>;
  } catch {
    return { effectiveRole: "user", companyId: null };
  }

  const platformRole = payload.platform_role as string | undefined;
  const companyRole = (payload.company_role as string) || "user";
  const companyId = (payload.company_id as string) || null;
  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : companyRole;

  return { effectiveRole, companyId };
}

export function getPermissionsFromSession(session: Session | null): Permissions {
  if (!session?.access_token) return NO_PERMS;
  const { effectiveRole, companyId } = extractJwtClaims(session.access_token);
  // No admin_permissions available from JWT alone — caller must enrich from DB for admin role.
  return buildPerms(effectiveRole, companyId, false);
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

      const { effectiveRole, companyId } = extractJwtClaims(session.access_token);

      // gridmaster / super_admin: all perms, no DB query needed.
      if (effectiveRole === "gridmaster" || effectiveRole === "super_admin") {
        if (mounted) setPerms(buildPerms(effectiveRole, companyId, false));
        return;
      }

      // admin: fetch admin_permissions from company_memberships.
      if (effectiveRole === "admin" && session.user?.id && companyId) {
        const { data } = await supabase
          .from("company_memberships")
          .select("admin_permissions")
          .eq("user_id", session.user.id)
          .eq("company_id", companyId)
          .single();

        if (mounted) {
          setPerms(buildPerms("admin", companyId, false, data?.admin_permissions ?? null));
        }
        return;
      }

      // user role from JWT — confirm against DB in case token is stale.
      if (session.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id, platform_role")
          .eq("id", session.user.id)
          .single();

        if (mounted && profile) {
          if (profile.platform_role === "gridmaster") {
            setPerms(buildPerms("gridmaster", profile.company_id, false));
            return;
          }

          if (profile.company_id) {
            const { data: membership } = await supabase
              .from("company_memberships")
              .select("company_role, admin_permissions")
              .eq("user_id", session.user.id)
              .eq("company_id", profile.company_id)
              .single();

            if (mounted && membership) {
              setPerms(buildPerms(
                membership.company_role,
                profile.company_id,
                false,
                membership.admin_permissions ?? null,
              ));
              return;
            }
          }
        }
      }

      if (mounted) setPerms(buildPerms(effectiveRole, companyId, false));
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
