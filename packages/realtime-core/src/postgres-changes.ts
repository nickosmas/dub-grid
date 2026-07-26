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
  /** Called on CHANNEL_ERROR. Platform plugs in Sentry / console.error / etc. */
  onError?: (error: Error) => void;
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
  let hadError = false;
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
    if (status === "SUBSCRIBED" && hadError) {
      hadError = false;
      hooks.onReconnectAfterError?.();
    } else if (status === "CHANNEL_ERROR") {
      hadError = true;
      hooks.onError?.(err ?? new Error(`realtime channel error: ${channelName}`));
    }
  });

  return () => {
    void client.removeChannel(channel);
  };
}
