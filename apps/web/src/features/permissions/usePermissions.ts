"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  createBrowserRealtimeChannel,
  fetchAccountPermissions,
  removeBrowserRealtimeChannel,
  type BrowserRealtimeChannel,
} from "@/features/account/client";
import {
  READ_ONLY_PERMS,
  ROLE_LEVEL,
} from "./core";
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
  // AuthProvider is the single source of truth for browser auth. usePermissions
  // used to call supabase.auth.getSession() + getUser() itself (up to 4 times
  // per mount), which raced AuthProvider's calls for the Web Locks API auth
  // lock and produced "Lock stolen" errors. Reading from context eliminates
  // that race entirely.
  const { user, session, isLoading: authLoading } = useAuth();
  const [perms, setPerms] = useState<Permissions>(() => permsCache ?? { ...LOADING_PERMS });

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

    // Different user than what's cached: invalidate so we don't flash the
    // previous user's resolved permissions while the new ones load.
    if (permsCache && permsCacheUserId && permsCacheUserId !== userId) {
      clearPermsCache();
      setPerms({ ...LOADING_PERMS });
    }

    // Fresh same-user cache: just surface it (every hook instance reads the
    // same module-level cache).
    const sameUser = permsCacheUserId === userId;
    if (permsCache && sameUser && Date.now() - permsCacheTimestamp < 10_000) {
      setPerms(permsCache);
      return;
    }

    const { effectiveRole, orgId } = extractJwtClaims(accessToken);

    void (async () => {
      try {
        const { permissions } = await fetchAccountPermissions();
        if (!mounted) return;
        permsCache = permissions;
        permsCacheTimestamp = Date.now();
        permsCacheUserId = userId;
        setPerms(permissions);
      } catch {
        if (!mounted) return;
        const fallback = buildPerms(effectiveRole, orgId, false);
        permsCache = fallback;
        permsCacheTimestamp = Date.now();
        permsCacheUserId = userId;
        setPerms(fallback);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, accessToken, userId]);

  // ── Realtime: invalidate permission cache on membership/department changes ──
  // When another session (e.g. super_admin) updates the current user's
  // admin_permissions, org_role, or a department's permissions template,
  // a Postgres change event re-resolves the cache and triggers a re-render.
  useEffect(() => {
    if (!accessToken || !userId) return;
    const { orgId } = extractJwtClaims(accessToken);

    let mounted = true;
    let membershipChannel: BrowserRealtimeChannel | null = null;
    let departmentChannel: BrowserRealtimeChannel | null = null;
    // Unique channel name per effect instance avoids reusing an already-subscribed
    // channel during React strict-mode double-mounts.
    const channelId = `perms:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    const reResolve = () => {
      clearPermsCache();
      void (async () => {
        try {
          const { permissions } = await fetchAccountPermissions();
          // Guard against an event firing in the gap between the channel
          // emitting and our cleanup completing — and against the user
          // changing while the fetch was in flight (don't write the new
          // user's perms under the old user's cache key).
          if (!mounted) return;
          permsCache = permissions;
          permsCacheTimestamp = Date.now();
          permsCacheUserId = userId;
          setPerms(permissions);
        } catch {
          // Leave the stale perms in place rather than dropping the user to
          // NO_PERMS on a transient network blip.
        }
      })();
    };

    membershipChannel = createBrowserRealtimeChannel(channelId)
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

    if (orgId) {
      departmentChannel = createBrowserRealtimeChannel(`dept-perms:${channelId}`)
        .on(
          "postgres_changes" as "system",
          {
            event: "UPDATE",
            schema: "public",
            table: "departments",
            filter: `org_id=eq.${orgId}`,
          } as Record<string, unknown>,
          reResolve,
        )
        .subscribe();
    }

    return () => {
      mounted = false;
      if (membershipChannel) void removeBrowserRealtimeChannel(membershipChannel);
      if (departmentChannel) void removeBrowserRealtimeChannel(departmentChannel);
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
