export interface DebouncedTableFlusher<Table extends string> {
  markChanged(table: Table): void;
  dispose(): void;
}

/**
 * Coalesces bursts of table-change events into one flush per `delayMs`
 * window. One save touches several tables, each sending its own change, so
 * the affected tables are collected and flushed once on a short debounce.
 * Each changed table still triggers exactly one flush per burst.
 */
export function createDebouncedTableFlusher<Table extends string>(
  delayMs: number,
  onFlush: (tables: Table[]) => void,
): DebouncedTableFlusher<Table> {
  const pendingTables = new Set<Table>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // An event can still arrive while the channel is leaving; once disposed it
  // must not arm a flush that runs after teardown.
  let disposed = false;

  const flush = () => {
    flushTimer = null;
    const tables = [...pendingTables];
    pendingTables.clear();
    onFlush(tables);
  };

  return {
    markChanged(table: Table) {
      if (disposed) return;
      pendingTables.add(table);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, delayMs);
      }
    },
    dispose() {
      disposed = true;
      pendingTables.clear();
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    },
  };
}
