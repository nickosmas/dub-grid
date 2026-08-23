"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  createBrowserRealtimeChannel,
  fetchAccountPermissions,
  removeBrowserRealtimeChannel,
  type BrowserRealtimeChannel,
} from "@/features/account/client";
import { queryKeys } from "@/lib/query-keys";
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

const NO_CLAIMS = { effectiveRole: "user", orgId: null as string | null };

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

/**
 * The caller's permissions, resolved once per (user, org) and shared.
 *
 * This used to keep a hand-rolled module-level cache with a 10-second TTL and
 * no in-flight dedupe. Across its 23 call sites — several of which mount
 * simultaneously on one page — a cold or expired cache meant every consumer
 * independently fired GET /api/account/permissions, and the short TTL meant
 * routine navigation almost always missed. React Query gives dedupe and a real
 * staleTime for free.
 *
 * Keying by (userId, orgId) also removes the bug the old cache needed manual
 * clearing for: a same-user org switch now lands on a different key instead of
 * serving the previous org's role for up to 10 seconds.
 */
export function usePermissions(): WebPermissions {
  // AuthProvider is the single source of truth for browser auth. usePermissions
  // used to call supabase.auth.getSession() + getUser() itself (up to 4 times
  // per mount), which raced AuthProvider's calls for the Web Locks API auth
  // lock and produced "Lock stolen" errors. Reading from context eliminates
  // that race entirely.
  const { user, session, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Reactively subscribe to user view toggle — reads sessionStorage directly,
  // re-renders all hook instances when setUserViewActive() is called.
  const userViewActive = useSyncExternalStore(subscribeUserView, readUserView, getServerSnapshot);

  const userId = user?.id ?? null;
  const accessToken = session?.access_token ?? null;

  // Both claims come straight off the token — no network. orgId is half the
  // cache identity, and is also what lets orgId-gated queries start while the
  // permissions request is still in flight.
  const claims = useMemo(
    () => (accessToken ? extractJwtClaims(accessToken) : NO_CLAIMS),
    [accessToken],
  );

  const signedOut = !authLoading && (!accessToken || !userId);
  const permissionsKey = queryKeys.account.permissions(userId, claims.orgId);

  const query = useQuery({
    queryKey: permissionsKey,
    queryFn: fetchAccountPermissions,
    enabled: !authLoading && Boolean(accessToken) && Boolean(userId),
    // Realtime below invalidates on the writes that actually move permissions,
    // so this does not need to be short. The old hand-rolled TTL was 10s, which
    // meant routine navigation refetched almost every time.
    staleTime: 60_000,
  });

  useEffect(() => {
    if (signedOut) setUserViewActive(false);
  }, [signedOut]);

  const perms: WebPermissions = useMemo(() => {
    if (authLoading) return LOADING_PERMS;
    if (!accessToken || !userId) return NO_PERMS;

    if (query.data) {
      return {
        ...query.data.permissions,
        isOnSchedule: query.data.isOnSchedule ?? false,
        isManagementUser: query.data.isManagementUser ?? false,
        mfaNagRequired: query.data.mfaNagRequired ?? false,
      };
    }

    // A failed lookup falls back to what the token alone can prove rather than
    // dropping the user to NO_PERMS on a transient network blip.
    if (query.isError) {
      return {
        ...buildPerms(claims.effectiveRole, claims.orgId, false),
        isOnSchedule: false,
        isManagementUser: false,
        mfaNagRequired: false,
      };
    }

    // Still loading: surface the JWT-derived orgId now so orgId-gated queries
    // (useEmployees, the org bootstrap) can fetch in parallel rather than
    // waiting on this one. isLoading stays true, so gates that key off it are
    // unaffected.
    return claims.orgId ? { ...LOADING_PERMS, orgId: claims.orgId } : LOADING_PERMS;
  }, [authLoading, accessToken, userId, query.data, query.isError, claims]);

  // ── Realtime: refresh permissions on membership changes ──
  // When another session (e.g. super_admin) updates the current user's
  // admin_permissions or org_role, a Postgres change event re-resolves them
  // and triggers a re-render. (L-2: we no longer subscribe to `departments` —
  // departments don't grant permissions, so those events only caused org-wide
  // perms-refetch storms with zero permission impact.)
  //
  // Also subscribe to `employees` for this user: bench/activate flips the
  // benched override (READ_ONLY_PERMS) in the permissions endpoint, and we
  // want the open tab to drop into / out of read-only the moment an admin
  // presses the button — not at next refresh. Terminated users get bounced at
  // the JWT-hook level on the next token refresh, so no extra wiring needed.
  useEffect(() => {
    if (!accessToken || !userId) return;

    let membershipChannel: BrowserRealtimeChannel | null = null;
    let employeeChannel: BrowserRealtimeChannel | null = null;
    // Unique channel name per effect instance avoids reusing an already-subscribed
    // channel during React strict-mode double-mounts.
    const channelSuffix = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    // Invalidate rather than refetch-and-assign: React Query drops the stale
    // mark, refetches once no matter how many consumers are mounted, and keeps
    // the previous value on screen if the refetch fails.
    const reResolve = () => {
      void queryClient.invalidateQueries({ queryKey: permissionsKey });
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
      if (membershipChannel) void removeBrowserRealtimeChannel(membershipChannel);
      if (employeeChannel) void removeBrowserRealtimeChannel(employeeChannel);
    };
    // permissionsKey is derived from userId + claims.orgId, both already listed.
  }, [accessToken, userId, claims.orgId, queryClient, permissionsKey]);
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
