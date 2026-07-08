"use client";

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import {
  createBrowserRealtimeChannel,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";

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
      return [accountAll, queryKeys.org.bootstrapAll()];
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

    let hadError = false;
    const channelId = `account-freshness:${userId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = createBrowserRealtimeChannel(channelId);
    const handleChange = (table: AccountRealtimeTable) => {
      invalidateAccountRealtimeQueries(queryClient, userId, table);
    };

    channel.on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${userId}`,
      } as Record<string, unknown>,
      () => handleChange("profiles"),
    );

    channel.on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "user_sessions",
        filter: `user_id=eq.${userId}`,
      } as Record<string, unknown>,
      () => handleChange("user_sessions"),
    );

    channel.on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "notification_preferences",
        filter: `user_id=eq.${userId}`,
      } as Record<string, unknown>,
      () => handleChange("notification_preferences"),
    );

    channel.subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED" && hadError) {
        hadError = false;
        void queryClient.invalidateQueries({
          queryKey: ["account", userId],
        });
      } else if (status === "CHANNEL_ERROR") {
        hadError = true;
        Sentry.captureException(err ?? new Error("account freshness channel error"));
      }
    });

    return () => {
      void removeBrowserRealtimeChannel(channel);
    };
  }, [disabled, queryClient, userId]);
}
