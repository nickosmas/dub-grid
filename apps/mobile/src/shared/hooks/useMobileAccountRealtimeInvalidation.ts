import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateMobileAccountRealtimeQueries,
  type MobileAccountRealtimeTable,
} from "../lib/mobile-account-realtime-invalidation";
import { getSupabaseClient } from "../lib/supabase";

export function useMobileAccountRealtimeInvalidation({
  accessToken,
  userId,
  disabled = false,
  queryClient,
}: {
  accessToken: string | null;
  userId: string | null;
  disabled?: boolean;
  queryClient: QueryClient;
}) {
  useEffect(() => {
    if (!accessToken || !userId || disabled) return;

    const supabase = getSupabaseClient();
    if (
      !supabase ||
      typeof supabase.channel !== "function" ||
      typeof supabase.removeChannel !== "function"
    ) {
      return;
    }
    const channelId = `mobile-account-freshness:${userId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = supabase.channel(channelId);
    const handleChange = (table: MobileAccountRealtimeTable) => {
      invalidateMobileAccountRealtimeQueries(queryClient, accessToken, table);
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${userId}`,
      },
      () => handleChange("profiles"),
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_sessions",
        filter: `user_id=eq.${userId}`,
      },
      () => handleChange("user_sessions"),
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notification_preferences",
        filter: `user_id=eq.${userId}`,
      },
      () => handleChange("notification_preferences"),
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => handleChange("notifications"),
    );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Mobile account realtime freshness channel error");
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accessToken, disabled, queryClient, userId]);
}
