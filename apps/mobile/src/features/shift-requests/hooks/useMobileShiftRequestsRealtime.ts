import { useEffect } from "react";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
import { getSupabaseClient } from "../../../shared/lib/supabase";

// Dedicated shift_requests channel, bypassing the debounced org-wide
// invalidation hook for tighter, lower-latency control on request-heavy
// screens (mirrors web's useShiftRequests.ts). Unlike web, this hook mounts
// from two call sites at once (ScheduleScreen + RequestsScreen), which stay
// alive simultaneously under native tabs — a static per-org channel name
// made the second mount collide with the first's already-subscribed
// channel, so this uses a unique-per-mount name instead.
export function useMobileShiftRequestsRealtime({
  orgId,
  disabled = false,
  onChange,
}: {
  orgId: string | null;
  disabled?: boolean;
  onChange: () => void;
}) {
  useEffect(() => {
    if (!orgId || disabled) return;

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
      createRealtimeChannelName(`shift_requests_${orgId}`),
      [
        {
          table: "shift_requests",
          filter: `org_id=eq.${orgId}`,
          onEvent: onChange,
        },
      ],
      {
        onReconnectAfterError: onChange,
        onError: (error) => {
          console.error("Mobile shift_requests channel error", error);
        },
      },
    );
  }, [disabled, onChange, orgId]);
}
