import { useEffect } from "react";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
import { getSupabaseClient } from "../../../shared/lib/supabase";

// Dedicated per-user notifications channel that reacts directly to realtime
// events (mirrors web's useNotificationsRealtime.ts + AlertsInboxPage's
// onChange wiring). The always-on useMobileAccountRealtimeInvalidation hook
// already invalidates the notifications query cache on the same table — this
// hook exists for screens that want a more latency-aware reaction (e.g.
// refetching immediately vs. waiting on the account hook's cache
// invalidation to trigger a background refetch).
export function useMobileNotificationsRealtimeTick({
  userId,
  disabled = false,
  onChange,
}: {
  userId: string | null;
  disabled?: boolean;
  onChange: () => void;
}) {
  useEffect(() => {
    if (!userId || disabled) return;

    const supabase = getSupabaseClient();
    if (
      !supabase ||
      typeof supabase.channel !== "function" ||
      typeof supabase.removeChannel !== "function"
    ) {
      return;
    }

    return subscribeToPostgresChanges(
      supabase,
      createRealtimeChannelName(`notifications:user:${userId}`),
      [
        {
          table: "notifications",
          filter: `user_id=eq.${userId}`,
          onEvent: onChange,
        },
      ],
      {
        onReconnectAfterError: onChange,
        onError: (error) => {
          console.error("Mobile notifications realtime channel error", error);
        },
      },
    );
  }, [disabled, onChange, userId]);
}
