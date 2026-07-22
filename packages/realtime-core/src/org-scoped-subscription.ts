import type { SupabaseClient } from "@supabase/supabase-js";
import { createRealtimeChannelName } from "./channel-name";
import { createDebouncedTableFlusher } from "./debounced-flusher";
import { subscribeToPostgresChanges, type RealtimeErrorHooks } from "./postgres-changes";

export interface OrgScopedRealtimeOptions<Table extends string> extends RealtimeErrorHooks {
  client: SupabaseClient;
  orgId: string;
  /** Tables filtered `org_id=eq.${orgId}`. */
  tables: readonly Table[];
  /** Adds a row-level listener filtered `id=eq.${orgId}` on this table. */
  rowScopedTable?: Table;
  debounceMs: number;
  /** Called with the deduplicated set of changed tables once per debounce window. */
  onFlush: (tables: Table[]) => void;
  channelNamePrefix: string;
}

/**
 * Composes `subscribeToPostgresChanges` + `createDebouncedTableFlusher` into
 * the "N org_id-filtered tables + optional id-filtered row + debounce +
 * reconnect" shape shared by every org-wide realtime-invalidation hook.
 * Returns a cleanup function.
 */
export function subscribeOrgScopedRealtime<Table extends string>(
  options: OrgScopedRealtimeOptions<Table>,
): () => void {
  const flusher = createDebouncedTableFlusher<Table>(options.debounceMs, options.onFlush);

  const listeners: Array<{
    table: Table;
    event?: "INSERT" | "UPDATE" | "DELETE" | "*";
    filter: string;
    onEvent: (table: Table) => void;
  }> = [];

  if (options.rowScopedTable) {
    listeners.push({
      table: options.rowScopedTable,
      filter: `id=eq.${options.orgId}`,
      onEvent: (table) => flusher.markChanged(table),
    });
  }

  for (const table of options.tables) {
    listeners.push({
      table,
      filter: `org_id=eq.${options.orgId}`,
      onEvent: (t) => flusher.markChanged(t),
    });
  }

  const unsubscribe = subscribeToPostgresChanges(
    options.client,
    createRealtimeChannelName(options.channelNamePrefix),
    listeners,
    {
      onError: options.onError,
      onReconnectAfterError: options.onReconnectAfterError,
    },
  );

  return () => {
    flusher.dispose();
    unsubscribe();
  };
}
