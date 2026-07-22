import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
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

    const handleChange = (table: MobileAccountRealtimeTable) => {
      invalidateMobileAccountRealtimeQueries(queryClient, accessToken, table);
    };

    return subscribeToPostgresChanges<MobileAccountRealtimeTable>(
      supabase,
      createRealtimeChannelName(`mobile-account-freshness:${userId}`),
      [
        { table: "profiles", filter: `id=eq.${userId}`, onEvent: handleChange },
        { table: "user_sessions", filter: `user_id=eq.${userId}`, onEvent: handleChange },
        {
          table: "notification_preferences",
          filter: `user_id=eq.${userId}`,
          onEvent: handleChange,
        },
        { table: "notifications", filter: `user_id=eq.${userId}`, onEvent: handleChange },
      ],
      {
        onError: (error) => {
          console.error("Mobile account realtime freshness channel error", error);
        },
      },
    );
  }, [accessToken, disabled, queryClient, userId]);
}
