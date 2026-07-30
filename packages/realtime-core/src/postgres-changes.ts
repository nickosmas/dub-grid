import type { SupabaseClient } from "@supabase/supabase-js";

export interface PostgresChangeListener<Table extends string = string> {
  table: Table;
  /** Defaults to "*" (all events). */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Defaults to "public". */
  schema?: string;
  filter: string;
  onEvent: (table: Table) => void;
}

export interface RealtimeErrorHooks {
  /**
   * Called on CHANNEL_ERROR. Platform plugs in Sentry / console.error / etc.
   * `consecutiveErrorCount` is 1 on the first error since the last successful
   * SUBSCRIBE and increments on each further error before a reconnect — this
   * package doesn't retry or back off itself (the underlying Supabase client
   * already does), it just counts, so callers can decide their own escalation
   * policy (e.g. only alert after N consecutive errors) without duplicating
   * that policy in every consumer on every platform.
   */
  onError?: (error: Error, consecutiveErrorCount: number) => void;
  /**
   * Called once when the channel re-SUBSCRIBEs after a prior error — the
   * "we may have missed events while disconnected" catch-up signal.
   */
  onReconnectAfterError?: () => void;
}

/**
 * Subscribes one Supabase realtime channel with N postgres_changes listeners.
 * Wraps CHANNEL_ERROR / reconnect-after-error bookkeeping. Does NOT construct
 * the client (callers pass an already-constructed SupabaseClient, since
 * client construction differs per platform) and does NOT generate the
 * channel name (most callers want a unique per-mount name via
 * `createRealtimeChannelName`, but some — e.g. a singleton-per-org channel —
 * intentionally use a static name, so naming is the caller's call).
 * Returns a cleanup function that removes the channel.
 */
export function subscribeToPostgresChanges<Table extends string>(
  client: SupabaseClient,
  channelName: string,
  listeners: ReadonlyArray<PostgresChangeListener<Table>>,
  hooks: RealtimeErrorHooks = {},
): () => void {
  let errorCount = 0;
  const channel = client.channel(channelName);

  for (const listener of listeners) {
    channel.on(
      "postgres_changes" as "system",
      {
        event: listener.event ?? "*",
        schema: listener.schema ?? "public",
        table: listener.table,
        filter: listener.filter,
      } as Record<string, unknown>,
      () => listener.onEvent(listener.table),
    );
  }

  channel.subscribe((status: string, err?: Error) => {
    if (status === "SUBSCRIBED" && errorCount > 0) {
      errorCount = 0;
      hooks.onReconnectAfterError?.();
    } else if (status === "CHANNEL_ERROR") {
      errorCount += 1;
      hooks.onError?.(err ?? new Error(`realtime channel error: ${channelName}`), errorCount);
    }
  });

  return () => {
    void client.removeChannel(channel);
  };
}
