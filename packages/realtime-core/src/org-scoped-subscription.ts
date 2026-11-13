import type { SupabaseClient } from "@supabase/supabase-js";
import { createDebouncedTableFlusher } from "./debounced-flusher";
import {
  orgDraftsTopic,
  orgTopic,
  subscribeToTableChanges,
  type RealtimeChangePayload,
  type RealtimeErrorHooks,
  type TableChangeListener,
} from "./table-changes";

export interface OrgScopedRealtimeOptions<Table extends string> extends RealtimeErrorHooks {
  client: SupabaseClient;
  orgId: string;
  /** Tables whose changes in this organization are flushed. */
  tables: readonly Table[];
  /**
   * Also listen on the organization's drafts topic, for draft cells,
   * snapshots and notes. Only someone who edits the schedule may join it.
   */
  includeDrafts?: boolean;
  debounceMs: number;
  /** Called with the deduplicated set of changed tables once per debounce window. */
  onFlush: (tables: Table[]) => void;
  /** Return true to leave an event out of the flush, for one the caller has fully handled. */
  skipEvent?: (table: Table, payload: RealtimeChangePayload) => boolean;
}

/**
 * Composes `subscribeToTableChanges` and `createDebouncedTableFlusher` into
 * the "an organization's tables, debounced, with reconnect" shape every
 * organization-wide invalidation hook shares. Returns a cleanup function.
 */
export function subscribeOrgScopedRealtime<Table extends string>(
  options: OrgScopedRealtimeOptions<Table>,
): () => void {
  const flusher = createDebouncedTableFlusher<Table>(options.debounceMs, options.onFlush);
  const markChanged = (table: Table, payload: RealtimeChangePayload) => {
    if (options.skipEvent?.(table, payload)) return;
    flusher.markChanged(table);
  };

  const topics = [orgTopic(options.orgId)];
  if (options.includeDrafts) topics.push(orgDraftsTopic(options.orgId));
  const listeners: TableChangeListener<Table>[] = topics.flatMap((topic) =>
    options.tables.map((table) => ({ table, topic, onEvent: markChanged })),
  );

  const unsubscribe = subscribeToTableChanges(options.client, listeners, {
    onError: options.onError,
    onReconnectAfterError: options.onReconnectAfterError,
  });

  return () => {
    flusher.dispose();
    unsubscribe();
  };
}
