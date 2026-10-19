"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { createRealtimeChannelName } from "@dubgrid/realtime-core";
import type { AdminPermissions } from "@/types";
import {
  createBrowserRealtimeChannel,
  removeBrowserRealtimeChannel,
  type AccountPermissionsResponse,
} from "@/features/account/client";
import { buildPerms, type Permissions } from "./shared";

type MembershipRow = Record<string, unknown>;

function isPermissionsKeyFor(userId: string) {
  return (key: QueryKey) => key[0] === "account" && key[1] === userId && key[3] === "permissions";
}

/**
 * Whether a membership UPDATE could move the cached permissions. The table has
 * the default replica identity, so the payload carries no old values; the new
 * row is rebuilt into permissions and compared with what the cache holds. Any
 * doubt answers true, so the server is asked again.
 */
export function membershipUpdateMayChangePermissions(
  row: MembershipRow | null | undefined,
  cached: Permissions | undefined,
): boolean {
  if (!row || !cached) return true;
  if (!("org_role" in row) || !("admin_permissions" in row) || !("archived_at" in row)) {
    return true;
  }
  if (row.archived_at !== null) return true;
  if (cached.isGridmaster || cached.isImpersonating || cached.isInactive) return true;
  if (!cached.orgId || row.org_id !== cached.orgId) return true;
  if (typeof row.org_role !== "string") return true;
  const adminPerms = row.admin_permissions;
  if (adminPerms !== null && (typeof adminPerms !== "object" || Array.isArray(adminPerms))) {
    return true;
  }

  const rebuilt = buildPerms(
    row.org_role,
    cached.orgId,
    false,
    adminPerms as AdminPermissions | null,
  ) as unknown as Record<string, unknown>;
  const current = cached as unknown as Record<string, unknown>;
  return Object.entries(rebuilt).some(
    ([key, value]) => typeof value !== "function" && key !== "isLoading" && current[key] !== value,
  );
}

function invalidatePermissions(
  queryClient: QueryClient,
  userId: string,
  shouldInvalidate: (data: AccountPermissionsResponse | undefined) => boolean,
) {
  const entries = queryClient.getQueriesData<AccountPermissionsResponse>({
    predicate: (query) => isPermissionsKeyFor(userId)(query.queryKey),
  });
  for (const [queryKey, data] of entries) {
    if (!shouldInvalidate(data)) continue;
    // Several invalidations can land together (a membership and an employees
    // event from one admin action); the default cancelRefetch would cancel the
    // fetch the previous call started.
    void queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
  }
}

/**
 * One membership and one employees channel per signed-in user, shared by every
 * usePermissions consumer and reference-counted like useNotificationsRealtime.
 * Keyed on the user alone: the filters only name the user, so a token refresh
 * or an org switch does not need a new subscription.
 */
const permissionSubscriptions = new Map<
  string,
  { count: number; clients: Map<QueryClient, number>; unsubscribe: () => void }
>();

export function acquirePermissionsSubscription(
  userId: string,
  queryClient: QueryClient,
): () => void {
  const existing = permissionSubscriptions.get(userId);
  if (existing) {
    existing.count += 1;
    existing.clients.set(queryClient, (existing.clients.get(queryClient) ?? 0) + 1);
  } else {
    const clients = new Map<QueryClient, number>([[queryClient, 1]]);
    const forEachClient = (fn: (client: QueryClient) => void) => {
      for (const client of clients.keys()) fn(client);
    };

    // Randomized for the same reason as useNotificationsRealtime: a StrictMode
    // remount can start a new channel before the old one finishes tearing down.
    const membershipChannel = createBrowserRealtimeChannel(
      createRealtimeChannelName(`perms:m:${userId}`),
    )
      .on(
        "postgres_changes" as "system",
        {
          event: "UPDATE",
          schema: "public",
          table: "organization_memberships",
          filter: `user_id=eq.${userId}`,
        } as Record<string, unknown>,
        (payload: { new?: MembershipRow }) => {
          // Opening Schedule stamps schedule_last_viewed_at on this same row,
          // which must not refetch permissions in every open tab.
          forEachClient((client) =>
            invalidatePermissions(client, userId, (data) =>
              membershipUpdateMayChangePermissions(payload?.new, data?.permissions),
            ),
          );
        },
      )
      .subscribe();

    // Bench and activate flip the read-only override in the permissions
    // endpoint, so the open tab should follow at once rather than at refresh.
    const employeeChannel = createBrowserRealtimeChannel(
      createRealtimeChannelName(`perms:e:${userId}`),
    )
      .on(
        "postgres_changes" as "system",
        {
          event: "UPDATE",
          schema: "public",
          table: "employees",
          filter: `user_id=eq.${userId}`,
        } as Record<string, unknown>,
        () => forEachClient((client) => invalidatePermissions(client, userId, () => true)),
      )
      .subscribe();

    permissionSubscriptions.set(userId, {
      count: 1,
      clients,
      unsubscribe: () => {
        void removeBrowserRealtimeChannel(membershipChannel);
        void removeBrowserRealtimeChannel(employeeChannel);
      },
    });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const entry = permissionSubscriptions.get(userId);
    if (!entry) return;
    const clientCount = (entry.clients.get(queryClient) ?? 0) - 1;
    if (clientCount <= 0) entry.clients.delete(queryClient);
    else entry.clients.set(queryClient, clientCount);
    entry.count -= 1;
    if (entry.count <= 0) {
      permissionSubscriptions.delete(userId);
      entry.unsubscribe();
    }
  };
}
