"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { subscribeToTableChanges, userTopic } from "@dubgrid/realtime-core";
import {
  getBrowserSupabaseClient,
  type AccountPermissionsResponse,
} from "@/features/account/client";

function isPermissionsKeyFor(userId: string) {
  return (key: QueryKey) => key[0] === "account" && key[1] === userId && key[3] === "permissions";
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
 * Keyed on the user alone: the topic only names the user, so a token refresh
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

    // The person's own topic carries their memberships and staff records. A
    // membership update that only stamped when they opened Schedule never
    // reaches it (140), so every change here may move their permissions; a
    // bench or activate flips the read-only override at once too.
    const unsubscribe = subscribeToTableChanges(getBrowserSupabaseClient(), [
      {
        table: "organization_memberships",
        topic: userTopic(userId),
        event: "UPDATE",
        onEvent: () => forEachClient((client) => invalidatePermissions(client, userId, () => true)),
      },
      {
        table: "employees",
        topic: userTopic(userId),
        event: "UPDATE",
        onEvent: () => forEachClient((client) => invalidatePermissions(client, userId, () => true)),
      },
    ]);

    permissionSubscriptions.set(userId, {
      count: 1,
      clients,
      unsubscribe,
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
