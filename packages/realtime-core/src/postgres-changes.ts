import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal shape of a Supabase postgres_changes payload the listeners can read. */
export interface RealtimeChangePayload {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export interface PostgresChangeListener<Table extends string = string> {
  table: Table;
  /** Defaults to "*" (all events). */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Defaults to "public". */
  schema?: string;
  /** Omit to subscribe to every row of the table (e.g. a platform-wide admin listener). */
  filter?: string;
  onEvent: (table: Table, payload: RealtimeChangePayload) => void;
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
   * Called once when the channel re-SUBSCRIBEs after an interruption, a
   * CHANNEL_ERROR or a TIMED_OUT — the "we may have missed events while
   * disconnected" catch-up signal.
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
  // A TIMED_OUT join is a gap in the stream just like an error, but the
  // client reports it without an error object, so it is tracked apart from
  // the error count that feeds onError.
  let interrupted = false;
  const channel = client.channel(channelName);

  for (const listener of listeners) {
    const config: Record<string, unknown> = {
      event: listener.event ?? "*",
      schema: listener.schema ?? "public",
      table: listener.table,
    };
    // Omit the filter key entirely when unfiltered — passing `filter: undefined`
    // is not the same as subscribing to every row.
    if (listener.filter !== undefined) {
      config.filter = listener.filter;
    }
    channel.on("postgres_changes" as "system", config, (payload: RealtimeChangePayload) =>
      listener.onEvent(listener.table, payload),
    );
  }

  channel.subscribe((status: string, err?: Error) => {
    // A throwing consumer hook must not propagate into the Supabase client's
    // own status-callback dispatch — that's shared machinery for this socket,
    // not something a single listener's bug should be able to disrupt.
    if (status === "SUBSCRIBED" && interrupted) {
      errorCount = 0;
      interrupted = false;
      try {
        hooks.onReconnectAfterError?.();
      } catch (hookError) {
        console.error(
          `[realtime-core] onReconnectAfterError hook threw for "${channelName}"`,
          hookError,
        );
      }
    } else if (status === "TIMED_OUT") {
      interrupted = true;
    } else if (status === "CHANNEL_ERROR") {
      errorCount += 1;
      interrupted = true;
      try {
        hooks.onError?.(err ?? new Error(`realtime channel error: ${channelName}`), errorCount);
      } catch (hookError) {
        console.error(`[realtime-core] onError hook threw for "${channelName}"`, hookError);
      }
    }
  });

  return () => {
    void client.removeChannel(channel);
  };
}
