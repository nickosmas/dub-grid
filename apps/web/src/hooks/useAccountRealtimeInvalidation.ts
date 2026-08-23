"use client";

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import { getBrowserSupabaseClient } from "@/features/account/client";

type AccountRealtimeTable = "profiles" | "user_sessions" | "notification_preferences";

export function getAccountRealtimeInvalidationKeys(
  userId: string,
  table: AccountRealtimeTable,
): readonly (readonly unknown[])[] {
  // Use prefix-based keys so all `account.self(userId, orgId)` variants invalidate
  // regardless of the orgId baked into the cached key.
  const accountAll = ["account", userId] as const;
  switch (table) {
    case "profiles":
      return [accountAll, queryKeys.org.bootstrap()];
    case "user_sessions":
      return [queryKeys.account.sessions(userId)];
    case "notification_preferences":
      return [queryKeys.account.notificationPrefs(userId)];
  }
}

export function invalidateAccountRealtimeQueries(
  queryClient: QueryClient,
  userId: string,
  table: AccountRealtimeTable,
): void {
  for (const queryKey of getAccountRealtimeInvalidationKeys(userId, table)) {
    void queryClient.invalidateQueries({ queryKey });
    broadcastInvalidation(queryKey);
  }
}

export function useAccountRealtimeInvalidation({
  userId,
  disabled = false,
  queryClient,
}: {
  userId: string | null;
  disabled?: boolean;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!userId || disabled) return;

    const handleChange = (table: AccountRealtimeTable) => {
      invalidateAccountRealtimeQueries(queryClient, userId, table);
    };

    return subscribeToPostgresChanges<AccountRealtimeTable>(
      getBrowserSupabaseClient(),
      createRealtimeChannelName(`account-freshness:${userId}`),
      [
        { table: "profiles", filter: `id=eq.${userId}`, onEvent: handleChange },
        { table: "user_sessions", filter: `user_id=eq.${userId}`, onEvent: handleChange },
        {
          table: "notification_preferences",
          filter: `user_id=eq.${userId}`,
          onEvent: handleChange,
        },
      ],
      {
        onReconnectAfterError: () => {
          void queryClient.invalidateQueries({
            queryKey: ["account", userId],
          });
        },
        onError: (error) => {
          Sentry.captureException(error);
        },
      },
    );
  }, [disabled, queryClient, userId]);
}
