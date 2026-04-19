"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { getImpersonationFromCookie } from "@/lib/impersonation";
import { getVerifiedBrowserAuth } from "@/lib/browser-auth";
import {
  READ_ONLY_PERMS,
  ROLE_LEVEL,
} from "./core";
import type { Session } from "@supabase/supabase-js";
import {
  buildPerms,
  extractJwtClaims,
} from "./shared";
import type { Permissions } from "./shared";

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

    /**
     * Preserve the last resolved permissions during same-user auth refreshes
     * (for example TOKEN_REFRESHED after the tab has been backgrounded).
     * This avoids remounting pages that gate rendering on perms.isLoading.
     */
    function shouldPreserveResolvedPerms(nextUserId: string | null): boolean {
      if (!permsCache || permsCache.isLoading || !permsCacheUserId) return false;
      if (!nextUserId) return true;
      return permsCacheUserId === nextUserId;
    }

    async function loadSession(session: Session | null, verifiedUserId: string | null) {
      if (!mounted) return;

      if (!session?.access_token) {
        setPermsAndCache(NO_PERMS, null);
        return;
      }

      const sessionUserId = verifiedUserId;
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
      if (effectiveRole === "admin" && verifiedUserId && orgId) {
        const { data } = await supabase
          .from("organization_memberships")
          .select("org_role, admin_permissions")
          .eq("user_id", verifiedUserId)
          .eq("org_id", orgId)
          .single();

        if (mounted) {
          const dbRole = data?.org_role ?? "user";
          setPermsAndCache(buildPerms(dbRole, orgId, false, data?.admin_permissions ?? null), sessionUserId);
        }
        return;
      }

      // user role from JWT — confirm against DB in case token is stale.
      if (verifiedUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id, platform_role")
          .eq("id", verifiedUserId)
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
              .eq("user_id", verifiedUserId)
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

    getVerifiedBrowserAuth()
      .then(({ session, user }) => {
        // Skip re-resolve if cache is fresh (< 10s old) AND belongs to the same user.
        // Still update local state from cache so every usePermissions() instance
        // gets the resolved value (multiple hooks share one module-level cache).
        const verifiedUserId = user?.id ?? null;
        const sameUser = !verifiedUserId || permsCacheUserId === verifiedUserId;
        if (permsCache && sameUser && Date.now() - permsCacheTimestamp < 10_000) {
          if (mounted) setPerms(permsCache);
          return;
        }
        loadSession(session, verifiedUserId);
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
        setPermsAndCache(NO_PERMS, null);
        return;
      }
      const nextUserId = session?.user?.id ?? null;
      if (!shouldPreserveResolvedPerms(nextUserId)) {
        setPerms((prev) => ({ ...prev, isLoading: true }));
      }
      void getVerifiedBrowserAuth().then(({ session: freshSession, user }) => {
        void loadSession(session ?? freshSession, user?.id ?? null);
      });
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
      getVerifiedBrowserAuth().then(({ session: fresh, user }) => {
        if (mounted) void loadSession(fresh, user?.id ?? null);
      });
    };

    if (typeof supabase.channel === "function") {
      getVerifiedBrowserAuth().then(({ session: s, user }) => {
        if (!mounted || !s?.access_token || !user?.id) return;
        const uid = user.id;
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
