import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
import type { RealtimeChangePayload } from "@dubgrid/realtime-core";
import {
  applyMobileNotificationInsert,
  invalidateMobileAccountRealtimeQueries,
  type MobileAccountRealtimeTable,
} from "../lib/mobile-account-realtime-invalidation";
import { getSupabaseClient } from "../lib/supabase";

export function useMobileAccountRealtimeInvalidation({
  accessToken,
  userId,
  queryClient,
}: {
  accessToken: string | null;
  userId: string | null;
  queryClient: QueryClient;
}) {
  // Read when an event lands, not a dependency: supabase-js hands each
  // refreshed token to the realtime socket itself, and rejoining the channel
  // on every refresh dropped the events sent while it was down.
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  const hasToken = accessToken !== null;

  useEffect(() => {
    if (!hasToken || !userId) return;

    const supabase = getSupabaseClient();
    if (
      !supabase ||
      typeof supabase.channel !== "function" ||
      typeof supabase.removeChannel !== "function"
    ) {
      return;
    }

    const handleChange = (table: MobileAccountRealtimeTable) => {
      const token = accessTokenRef.current;
      if (!token) return;
      invalidateMobileAccountRealtimeQueries(queryClient, token, table);
    };
    const handleNotificationChange = (
      table: MobileAccountRealtimeTable,
      payload: RealtimeChangePayload,
    ) => {
      const token = accessTokenRef.current;
      if (!token) return;
      if (payload.eventType === "INSERT") {
        applyMobileNotificationInsert(queryClient, token, payload.new);
        return;
      }
      invalidateMobileAccountRealtimeQueries(queryClient, token, table);
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
        {
          table: "notifications",
          filter: `user_id=eq.${userId}`,
          onEvent: handleNotificationChange,
        },
      ],
      {
        onError: (error) => {
          console.error("Mobile account realtime freshness channel error", error);
        },
      },
    );
  }, [hasToken, queryClient, userId]);
}
