// src/hooks/usePermissions.ts
import { useEffect, useState, useSyncExternalStore } from "react";
import { decodeJwt } from "jose";
import { supabase } from "@/lib/supabase";
import { getImpersonationFromCookie } from "@/lib/impersonation";
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

/** Read-only baseline — used for user role (and admin with no configured perms). */
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

/**
 * Enforce view implications: canManage* implies canView* for each paired permission.
 * Also sets canViewDashboardAnalytics when the user has any edit/manage permission.
 */
export function applyViewImplications(p: AdminPermissions): AdminPermissions {
  const result = { ...p };
  result.canViewEmployeeDetails = result.canViewEmployeeDetails || result.canManageEmployees;
  result.canViewFocusAreas = result.canViewFocusAreas || result.canManageFocusAreas;
  result.canViewShiftCodes = result.canViewShiftCodes || result.canManageShiftCodes;
  result.canViewIndicatorTypes = result.canViewIndicatorTypes || result.canManageIndicatorTypes;
  result.canViewCoverageRequirements = result.canViewCoverageRequirements || result.canManageCoverageRequirements;
  result.canViewRecurringShifts = result.canViewRecurringShifts || result.canManageRecurringShifts;
  result.canViewOrgLabels = result.canViewOrgLabels || result.canManageOrgLabels;
  result.canViewDashboardAnalytics = result.canViewDashboardAnalytics ||
    result.canEditShifts || result.canManageEmployees || result.canPublishSchedule ||
    result.canApproveShiftRequests;
  return result;
}

/** Union multiple permission sets — most permissive wins per boolean field. */
export function unionPermissions(permsList: AdminPermissions[]): AdminPermissions {
  const result: AdminPermissions = { ...READ_ONLY_PERMS };
  for (const p of permsList) {
    for (const key of Object.keys(result) as (keyof AdminPermissions)[]) {
      if (p[key]) (result as unknown as Record<string, boolean>)[key] = true;
    }
  }
  // canManageOrgSettings must never be granted via department permissions
  result.canManageOrgSettings = false;
  return result;
}

export interface Permissions extends AdminPermissions {
  role: string;
  orgId: string | null;
  level: number;
  isLoading: boolean;
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  /** True when gridmaster is impersonating another user. */
  isImpersonating: boolean;
  /** True when admin is previewing as a regular user. */
  isUserViewActive: boolean;
  /** The user's actual role level (unaffected by user view toggle). */
  actualLevel: number;
  /** True if user can edit any org config (has any manage-level config permission). */
  canManageOrg: boolean;
  /** True if user can access the settings page (has any view or manage config permission). */
  canAccessSettings: boolean;
  /** True if user can invite / change roles of org members (super_admin+ only). */
  canManageUsers: boolean;
  /** True if user can configure per-admin permissions (super_admin+ only). */
  canConfigureAdminPermissions: boolean;
  atLeast: (role: string) => boolean;
}

/** @internal Exported for unit tests only. */
export function buildPerms(
  role: string,
  orgId: string | null,
  isLoading: boolean,
  adminPerms?: AdminPermissions | null,
  isImpersonating = false,
): Permissions {
  const level = ROLE_LEVEL[role] ?? 0;
  const isGridmaster = level >= 4;
  const isSuperAdmin = level >= 3;

  let p: AdminPermissions;
  if (isGridmaster || isSuperAdmin) {
    p = ALL_PERMS;
  } else if (role === "admin") {
    p = adminPerms
      ? { ...adminPerms, canViewSchedule: true }
      : READ_ONLY_PERMS;
  } else if (role === "user") {
    // Permissions come from admin_permissions (configured per-user from department roster).
    p = adminPerms
      ? { ...adminPerms, canViewSchedule: true, canViewStaff: true, canManageOrgSettings: false }
      : { ...READ_ONLY_PERMS };
  } else {
    p = READ_ONLY_PERMS;
  }

  // ── Impersonation action restrictions ─────────────────────────────
  // During impersonation, block destructive/administrative operations.
  // Schedule editing is preserved for debugging write flows.
  if (isImpersonating) {
    p = {
      ...p,
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

  // ── Apply view implications: canManage* → canView* ────────────────
  p = applyViewImplications(p);

  const canManageOrg =
    isGridmaster ||
    isSuperAdmin ||
    p.canManageFocusAreas ||
    p.canManageShiftCodes ||
    p.canManageIndicatorTypes ||
    p.canManageOrgSettings ||
    p.canManageOrgLabels ||
    p.canManageCoverageRequirements;

  const canAccessSettings =
    canManageOrg ||
    p.canViewFocusAreas ||
    p.canViewShiftCodes ||
    p.canViewIndicatorTypes ||
    p.canViewOrgLabels ||
    p.canViewCoverageRequirements;

  return {
    ...p,
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
    canManageUsers: isImpersonating ? false : (isSuperAdmin || isGridmaster),
    canConfigureAdminPermissions: isImpersonating ? false : (isSuperAdmin || isGridmaster),
    atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
  };
}

const LOADING_PERMS: Permissions = buildPerms("user", null, true);
LOADING_PERMS.isLoading = true;

const NO_PERMS: Permissions = buildPerms("user", null, false);

// ── Module-level cache ──────────────────────────────────────────────────────
// Same pattern as org/employee caches — survives across route navigations.
// Permissions rarely change within a session, so cached value is safe to show
// instantly while a background re-resolve happens.

let permsCache: Permissions | null = null;
let permsCacheTimestamp = 0;
let permsCacheUserId: string | null = null;

/** Clear the permission cache (call on logout). Does NOT affect user view state. */
export function clearPermsCache(): void {
  permsCache = null;
  permsCacheTimestamp = 0;
  permsCacheUserId = null;
}

// ── User View toggle ───────────────────────────────────────────────────────
// Client-side-only flag that lets admins preview the UI as a regular user.
// Persisted in sessionStorage so it survives page refreshes and navigations.
// Only cleared on manual exit or sign-out.
// Uses useSyncExternalStore for reliable cross-instance reactivity.

const USER_VIEW_KEY = "dg_user_view";
const userViewListeners = new Set<() => void>();

function readUserView(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(USER_VIEW_KEY) === "1";
}

function subscribeUserView(callback: () => void): () => void {
  userViewListeners.add(callback);
  return () => { userViewListeners.delete(callback); };
}

const SERVER_SNAPSHOT = false;
function getServerSnapshot(): boolean {
  return SERVER_SNAPSHOT;
}

export function setUserViewActive(active: boolean): void {
  if (typeof window !== "undefined") {
    if (active) {
      sessionStorage.setItem(USER_VIEW_KEY, "1");
    } else {
      sessionStorage.removeItem(USER_VIEW_KEY);
    }
  }
  userViewListeners.forEach((fn) => fn());
}

export function getUserViewActive(): boolean {
  return readUserView();
}

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
  const [perms, setPerms] = useState<Permissions>(() => permsCache ?? { ...LOADING_PERMS });

  // Reactively subscribe to user view toggle — reads sessionStorage directly,
  // re-renders all hook instances when setUserViewActive() is called.
  const userViewActive = useSyncExternalStore(subscribeUserView, readUserView, getServerSnapshot);

  useEffect(() => {
    let mounted = true;

    /** Set both React state and module-level cache. */
    function setPermsAndCache(p: Permissions, userId: string | null = null) {
      permsCache = p;
      permsCacheTimestamp = Date.now();
      permsCacheUserId = userId;
      if (mounted) setPerms(p);
    }

    async function loadSession(session: Session | null) {
      if (!mounted) return;

      if (!session?.access_token) {
        setPermsAndCache(NO_PERMS, null);
        return;
      }

      const sessionUserId = session.user?.id ?? null;
      if (permsCache && permsCacheUserId && permsCacheUserId !== sessionUserId) {
        permsCache = null;
        permsCacheTimestamp = 0;
        permsCacheUserId = null;
        if (mounted) setPerms({ ...LOADING_PERMS });
      }

      // ── Impersonation override ──────────────────────────────────────
      // When a gridmaster has an active impersonation cookie, resolve
      // permissions as the target user instead of the gridmaster.
      if (typeof document !== "undefined") {
        const imp = getImpersonationFromCookie(document.cookie);
        if (imp) {
          const targetRole = imp.targetOrgRole;
          const targetOrgId = imp.targetOrgId;

          if (targetRole === "super_admin") {
            setPermsAndCache(buildPerms("super_admin", targetOrgId, false, null, true), sessionUserId);
            return;
          }

          if (targetRole === "admin") {
            // Fetch the target user's admin_permissions
            const { data } = await supabase
              .from("organization_memberships")
              .select("org_role, admin_permissions")
              .eq("user_id", imp.targetUserId)
              .eq("org_id", targetOrgId)
              .single();

            if (mounted) {
              const dbRole = data?.org_role ?? "user";
              setPermsAndCache(buildPerms(dbRole, targetOrgId, false, data?.admin_permissions ?? null, true), sessionUserId);
            }
            return;
          }

          // user role — permissions come from admin_permissions (per-user)
          {
            const { data: mem } = await supabase
              .from("organization_memberships")
              .select("admin_permissions")
              .eq("user_id", imp.targetUserId)
              .eq("org_id", targetOrgId)
              .single();

            if (mounted) {
              setPermsAndCache(buildPerms("user", targetOrgId, false, mem?.admin_permissions ?? null, true), sessionUserId);
            }
          }
          return;
        }
      }

      const { effectiveRole, orgId } = extractJwtClaims(session.access_token);

      // gridmaster / super_admin: all perms, no DB query needed.
      if (effectiveRole === "gridmaster" || effectiveRole === "super_admin") {
        setPermsAndCache(buildPerms(effectiveRole, orgId, false), sessionUserId);
        return;
      }

      // admin: fetch admin_permissions from organization_memberships.
      // Also fetch org_role to detect role changes (e.g. downgrade) since the JWT.
      if (effectiveRole === "admin" && session.user?.id && orgId) {
        const { data } = await supabase
          .from("organization_memberships")
          .select("org_role, admin_permissions")
          .eq("user_id", session.user.id)
          .eq("org_id", orgId)
          .single();

        if (mounted) {
          const dbRole = data?.org_role ?? "user";
          setPermsAndCache(buildPerms(dbRole, orgId, false, data?.admin_permissions ?? null), sessionUserId);
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
            setPermsAndCache(buildPerms("gridmaster", profile.org_id, false), sessionUserId);
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
              setPermsAndCache(buildPerms(
                membership.org_role,
                profile.org_id,
                false,
                membership.admin_permissions ?? null,
              ), sessionUserId);
              return;
            }
          }
        }
      }

      setPermsAndCache(buildPerms(effectiveRole, orgId, false), sessionUserId);
    }

    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        // Skip re-resolve if cache is fresh (< 10s old) AND belongs to the same user.
        // Still update local state from cache so every usePermissions() instance
        // gets the resolved value (multiple hooks share one module-level cache).
        const sameUser = !session?.user?.id || permsCacheUserId === session.user.id;
        if (permsCache && sameUser && Date.now() - permsCacheTimestamp < 10_000) {
          if (mounted) setPerms(permsCache);
          return;
        }
        loadSession(session);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      if (event === "INITIAL_SESSION") return;
      // On sign-out, immediately clear cached perms to prevent stale data
      // flashing when a different user signs in.
      if (event === "SIGNED_OUT") {
        permsCache = null;
        permsCacheTimestamp = 0;
        permsCacheUserId = null;
        setUserViewActive(false);
      }
      setPerms((prev) => ({ ...prev, isLoading: true }));
      loadSession(session);
    });

    // ── Realtime: invalidate permission cache on membership/department changes ──
    // When another session (e.g. super_admin) updates the current user's
    // admin_permissions, org_role, or a department's permissions template,
    // we get a Postgres change event and immediately re-resolve.
    let membershipChannel: ReturnType<typeof supabase.channel> | null = null;
    let departmentChannel: ReturnType<typeof supabase.channel> | null = null;
    // Unique channel name per effect instance avoids reusing an already-subscribed
    // channel during React strict-mode double-mounts.
    const channelId = `perms:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    const reResolve = () => {
      clearPermsCache();
      supabase.auth.getSession().then(({ data: { session: fresh } }: { data: { session: Session | null } }) => {
        if (mounted) loadSession(fresh);
      });
    };

    if (typeof supabase.channel === "function") {
      supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
        if (!mounted || !s?.user?.id) return;
        const uid = s.user.id;
        membershipChannel = supabase
          .channel(channelId)
          .on(
            "postgres_changes" as "system",
            {
              event: "UPDATE",
              schema: "public",
              table: "organization_memberships",
              filter: `user_id=eq.${uid}`,
            } as Record<string, unknown>,
            reResolve,
          )
          .subscribe();

        // Listen for department permission template changes (scoped to user's org)
        const { orgId: userOrgId } = extractJwtClaims(s.access_token);
        if (userOrgId) {
          departmentChannel = supabase
            .channel(`dept-perms:${channelId}`)
            .on(
              "postgres_changes" as "system",
              {
                event: "UPDATE",
                schema: "public",
                table: "departments",
                filter: `org_id=eq.${userOrgId}`,
              } as Record<string, unknown>,
              reResolve,
            )
            .subscribe();
        }
      });
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (membershipChannel) supabase.removeChannel(membershipChannel);
      if (departmentChannel) supabase.removeChannel(departmentChannel);
    };
  }, []);

  // ── User View override ──────────────────────────────────────────────
  // When active, return read-only permissions so admins see the user experience.
  // Preserve orgId so data fetching still works (user is still authenticated).
  if (userViewActive && perms.level >= 2) {
    return {
      ...READ_ONLY_PERMS,
      role: "user",
      orgId: perms.orgId,
      level: 0,
      isLoading: false,
      isGridmaster: false,
      isSuperAdmin: false,
      isImpersonating: false,
      isUserViewActive: true,
      actualLevel: perms.level,
      canManageOrg: false,
      canAccessSettings: false,
      canManageUsers: false,
      canConfigureAdminPermissions: false,
      atLeast: (r: string) => 0 >= (ROLE_LEVEL[r] ?? 0),
    };
  }

  // Always reflect the toggle state so the banner renders even while perms load.
  if (userViewActive) {
    return { ...perms, isUserViewActive: true, actualLevel: perms.level };
  }

  return perms;
}
