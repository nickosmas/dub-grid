export interface DebouncedTableFlusher<Table extends string> {
  markChanged(table: Table): void;
  dispose(): void;
}

/**
 * Coalesces bursts of table-change events into one flush per `delayMs`
 * window. A bulk save (e.g. saving N departments) emits one postgres_changes
 * event per row — rather than running the full invalidation set N times,
 * accumulate the affected tables and flush once on a short debounce.
 * Correctness is unchanged: each changed table still triggers exactly one
 * flush per burst, just not one flush per event.
 */
export function createDebouncedTableFlusher<Table extends string>(
  delayMs: number,
  onFlush: (tables: Table[]) => void,
): DebouncedTableFlusher<Table> {
  const pendingTables = new Set<Table>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    flushTimer = null;
    const tables = [...pendingTables];
    pendingTables.clear();
    onFlush(tables);
  };

  return {
    markChanged(table: Table) {
      pendingTables.add(table);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, delayMs);
      }
    },
    dispose() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    },
  };
}
