import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeToTableChanges, userTopic } from "@dubgrid/realtime-core";
import {
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
    // A change carries no row (140), so a new alert refetches the inbox
    // rather than being added to the cache from the event.
    const topic = userTopic(userId);
    return subscribeToTableChanges<MobileAccountRealtimeTable>(
      supabase,
      [
        { table: "profiles", topic, onEvent: handleChange },
        { table: "user_sessions", topic, onEvent: handleChange },
        { table: "notification_preferences", topic, onEvent: handleChange },
        { table: "notifications", topic, onEvent: handleChange },
      ],
      {
        onError: (error) => {
          console.error("Mobile account realtime freshness channel error", error);
        },
      },
    );
  }, [hasToken, queryClient, userId]);
}
