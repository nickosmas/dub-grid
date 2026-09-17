import { useEffect, useRef } from "react";
import { createRealtimeChannelName, subscribeToPostgresChanges } from "@dubgrid/realtime-core";
import { getSupabaseClient } from "../../../shared/lib/supabase";

type Listener = () => void;

interface SharedChannel {
  count: number;
  listeners: Set<Listener>;
  unsubscribe: () => void;
}

// One shift_requests channel per organization, shared by every screen that
// wants to hear about it. Under native tabs the Schedule, Requests and Team
// screens stay mounted at once; each used to open its own channel and refetch
// independently on the same row change. This registry mirrors web's
// reference-counted useOrgRealtimeInvalidation: the first mount opens the
// channel, later mounts join it, and the last unmount closes it.
const sharedChannels = new Map<string, SharedChannel>();

function acquireShiftRequestsChannel(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  orgId: string,
  listener: Listener,
): () => void {
  let entry = sharedChannels.get(orgId);
  if (!entry) {
    const listeners = new Set<Listener>();
    // Snapshot before iterating: a listener may unmount another screen.
    const notify = () => {
      for (const current of Array.from(listeners)) current();
    };
    const unsubscribe = subscribeToPostgresChanges(
      supabase,
      createRealtimeChannelName(`shift_requests_${orgId}`),
      [
        {
          table: "shift_requests",
          filter: `org_id=eq.${orgId}`,
          onEvent: notify,
        },
      ],
      {
        onReconnectAfterError: notify,
        onError: (error) => {
          console.error("Mobile shift_requests channel error", error);
        },
      },
    );
    entry = { count: 0, listeners, unsubscribe };
    sharedChannels.set(orgId, entry);
  }
  entry.count += 1;
  entry.listeners.add(listener);

  let released = false;
  return () => {
    // React can run a cleanup more than once; a second release must not
    // decrement a count other screens still hold.
    if (released) return;
    released = true;
    const current = sharedChannels.get(orgId);
    if (!current) return;
    current.listeners.delete(listener);
    current.count -= 1;
    if (current.count <= 0) {
      sharedChannels.delete(orgId);
      current.unsubscribe();
    }
  };
}

// Dedicated shift_requests channel, bypassing the debounced org-wide
// invalidation hook for tighter, lower-latency control on request-heavy
// screens (mirrors web's useShiftRequests.ts).
export function useMobileShiftRequestsRealtime({
  orgId,
  disabled = false,
  onChange,
}: {
  orgId: string | null;
  disabled?: boolean;
  onChange: () => void;
}) {
  // The channel is keyed on the org, not on the callback: a screen handing
  // in a new onChange identity should keep listening, not resubscribe.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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

    return acquireShiftRequestsChannel(supabase, orgId, () => onChangeRef.current());
  }, [disabled, orgId]);
}
