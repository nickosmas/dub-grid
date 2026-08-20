"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  createBrowserRealtimeChannel,
  fetchAccountPermissions,
  removeBrowserRealtimeChannel,
  type BrowserRealtimeChannel,
} from "@/features/account/client";
import { READ_ONLY_PERMS, ROLE_LEVEL } from "./core";
import { buildPerms, extractJwtClaims } from "./shared";
import type { Permissions } from "./shared";

// Self-employment shape (own employees row), used by web nav (Header.tsx) to
// detect "management-only, non-admin" accounts that should only see
// Schedule + People, never Dashboard. Not part of the shared @dubgrid/authz
// Permissions type — it's a web-only nav concern, resolved alongside
// permissions by /api/account/permissions.
export interface WebPermissions extends Permissions {
  isOnSchedule: boolean;
  isManagementUser: boolean;
  mfaNagRequired: boolean;
}

const LOADING_PERMS: WebPermissions = {
  ...buildPerms("user", null, true),
  isOnSchedule: false,
  isManagementUser: false,
  mfaNagRequired: false,
};
LOADING_PERMS.isLoading = true;

const NO_PERMS: WebPermissions = {
  ...buildPerms("user", null, false),
  isOnSchedule: false,
  isManagementUser: false,
  mfaNagRequired: false,
};

// ── Module-level cache ──────────────────────────────────────────────────────
// Same pattern as org/employee caches — survives across route navigations.
// Permissions rarely change within a session, so cached value is safe to show
// instantly while a background re-resolve happens.

let permsCache: WebPermissions | null = null;
let permsCacheTimestamp = 0;
let permsCacheUserId: string | null = null;
// Part of the cache identity, not just of its contents: one user can be an
// admin in one organization and a plain member of another, so a user-only key
// served the previous org's role, orgId and admin_permissions for up to the 10s
// window after a same-user org change.
let permsCacheOrgId: string | null = null;

/** Clear the permission cache (call on logout, and on org switch). Does NOT affect user view state. */
export function clearPermsCache(): void {
  permsCache = null;
  permsCacheTimestamp = 0;
  permsCacheUserId = null;
  permsCacheOrgId = null;
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
  return () => {
    userViewListeners.delete(callback);
  };
}

const SERVER_SNAPSHOT = false;
function getServerSnapshot(): boolean {
  return SERVER_SNAPSHOT;
}

export function setUserViewActive(active: boolean): void {
  if (typeof window === "undefined") return;
  // No-op when unchanged (L-1) — avoids a synchronous re-render storm across
  // every mounted usePermissions consumer when nothing actually changed.
  if (readUserView() === active) return;
  if (active) {
    sessionStorage.setItem(USER_VIEW_KEY, "1");
  } else {
    sessionStorage.removeItem(USER_VIEW_KEY);
  }
  userViewListeners.forEach((fn) => fn());
}

export function getUserViewActive(): boolean {
  return readUserView();
}

export function usePermissions(): WebPermissions {
  // AuthProvider is the single source of truth for browser auth. usePermissions
  // used to call supabase.auth.getSession() + getUser() itself (up to 4 times
  // per mount), which raced AuthProvider's calls for the Web Locks API auth
  // lock and produced "Lock stolen" errors. Reading from context eliminates
  // that race entirely.
  const { user, session, isLoading: authLoading } = useAuth();
  const [perms, setPerms] = useState<WebPermissions>(() => permsCache ?? { ...LOADING_PERMS });

  // Reactively subscribe to user view toggle — reads sessionStorage directly,
  // re-renders all hook instances when setUserViewActive() is called.
  const userViewActive = useSyncExternalStore(subscribeUserView, readUserView, getServerSnapshot);

  const userId = user?.id ?? null;
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    let mounted = true;

    // Wait for AuthProvider to finish its initial session resolution before
    // deciding anything. Treat the in-flight state as loading.
    if (authLoading) {
      setPerms((prev) => (prev.isLoading ? prev : { ...LOADING_PERMS }));
      return;
    }

    // Signed out (or auth resolution failed): clear cache and report NO_PERMS.
    if (!accessToken || !userId) {
      clearPermsCache();
      setUserViewActive(false);
      setPerms(NO_PERMS);
      return;
    }

    // Resolved before the cache checks below, because the org is half of the
    // cache's identity. Both claims come straight off the token — no network.
    const { effectiveRole, orgId } = extractJwtClaims(accessToken);

    // Different user OR different organization than what's cached: invalidate
    // so we don't flash the previous context's resolved permissions while the
    // new ones load.
    if (
      permsCache &&
      ((permsCacheUserId && permsCacheUserId !== userId) || permsCacheOrgId !== orgId)
    ) {
      clearPermsCache();
      setPerms({ ...LOADING_PERMS });
    }

    // Fresh cache for this exact user + org: just surface it (every hook
    // instance reads the same module-level cache).
    const sameContext = permsCacheUserId === userId && permsCacheOrgId === orgId;
    if (permsCache && sameContext && Date.now() - permsCacheTimestamp < 10_000) {
      setPerms(permsCache);
      return;
    }

    // Surface the JWT-derived orgId immediately, while permissions are still
    // loading. orgId is a JWT claim (no network needed), so orgId-gated queries
    // like useEmployees can start fetching in parallel with this permissions
    // request and the org bootstrap, instead of waiting for either to resolve.
    // isLoading stays true, so UI gates that key off permsLoading are unaffected.
    if (orgId) {
      setPerms((prev) =>
        prev.orgId === orgId && prev.isLoading ? prev : { ...LOADING_PERMS, orgId },
      );
    }

    void (async () => {
      try {
        const {
          permissions,
          isOnSchedule = false,
          isManagementUser = false,
          mfaNagRequired = false,
        } = await fetchAccountPermissions();
        if (!mounted) return;
        const merged: WebPermissions = {
          ...permissions,
          isOnSchedule,
          isManagementUser,
          mfaNagRequired,
        };
        permsCache = merged;
        permsCacheTimestamp = Date.now();
        permsCacheUserId = userId;
        permsCacheOrgId = orgId;
        setPerms(merged);
      } catch {
        if (!mounted) return;
        const fallback: WebPermissions = {
          ...buildPerms(effectiveRole, orgId, false),
          isOnSchedule: false,
          isManagementUser: false,
          mfaNagRequired: false,
        };
        permsCache = fallback;
        permsCacheTimestamp = Date.now();
        permsCacheUserId = userId;
        permsCacheOrgId = orgId;
        setPerms(fallback);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, accessToken, userId]);

  // ── Realtime: invalidate permission cache on membership changes ──
  // When another session (e.g. super_admin) updates the current user's
  // admin_permissions or org_role, a Postgres change event re-resolves the
  // cache and triggers a re-render. (L-2: we no longer subscribe to
  // `departments` — departments don't grant permissions, so those events only
  // caused org-wide perms-refetch storms with zero permission impact.)
  //
  // Also subscribe to `employees` for this user: bench/activate flips the
  // benched override (READ_ONLY_PERMS) in the permissions endpoint, and we
  // want the open tab to drop into / out of read-only the moment an admin
  // presses the button — not at next refresh. Terminated users get bounced at
  // the JWT-hook level on the next token refresh, so no extra wiring needed.
  useEffect(() => {
    if (!accessToken || !userId) return;

    let mounted = true;
    let membershipChannel: BrowserRealtimeChannel | null = null;
    let employeeChannel: BrowserRealtimeChannel | null = null;
    // Unique channel name per effect instance avoids reusing an already-subscribed
    // channel during React strict-mode double-mounts.
    const channelSuffix = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    const reResolve = () => {
      clearPermsCache();
      void (async () => {
        try {
          const {
            permissions,
            isOnSchedule = false,
            isManagementUser = false,
            mfaNagRequired = false,
          } = await fetchAccountPermissions();
          // Guard against an event firing in the gap between the channel
          // emitting and our cleanup completing — and against the user
          // changing while the fetch was in flight (don't write the new
          // user's perms under the old user's cache key).
          if (!mounted) return;
          const merged: WebPermissions = {
            ...permissions,
            isOnSchedule,
            isManagementUser,
            mfaNagRequired,
          };
          permsCache = merged;
          permsCacheTimestamp = Date.now();
          permsCacheUserId = userId;
          setPerms(merged);
        } catch {
          // Leave the stale perms in place rather than dropping the user to
          // NO_PERMS on a transient network blip.
        }
      })();
    };

    membershipChannel = createBrowserRealtimeChannel(`perms:m:${channelSuffix}`)
      .on(
        "postgres_changes" as "system",
        {
          event: "UPDATE",
          schema: "public",
          table: "organization_memberships",
          filter: `user_id=eq.${userId}`,
        } as Record<string, unknown>,
        reResolve,
      )
      .subscribe();

    employeeChannel = createBrowserRealtimeChannel(`perms:e:${channelSuffix}`)
      .on(
        "postgres_changes" as "system",
        {
          event: "UPDATE",
          schema: "public",
          table: "employees",
          filter: `user_id=eq.${userId}`,
        } as Record<string, unknown>,
        reResolve,
      )
      .subscribe();

    return () => {
      mounted = false;
      if (membershipChannel) void removeBrowserRealtimeChannel(membershipChannel);
      if (employeeChannel) void removeBrowserRealtimeChannel(employeeChannel);
    };
  }, [accessToken, userId]);

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
      isInactive: false,
      actualLevel: perms.level,
      canManageOrg: false,
      canAccessSettings: false,
      canManageUsers: false,
      canConfigureAdminPermissions: false,
      isOnSchedule: perms.isOnSchedule,
      isManagementUser: perms.isManagementUser,
      mfaNagRequired: perms.mfaNagRequired,
      atLeast: (r: string) => 0 >= (ROLE_LEVEL[r] ?? 0),
    };
  }

  // Always reflect the toggle state so the banner renders even while perms load.
  if (userViewActive) {
    return { ...perms, isUserViewActive: true, actualLevel: perms.level };
  }

  return perms;
}
