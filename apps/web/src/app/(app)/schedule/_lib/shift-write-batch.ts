import type { SuggestionWrite } from "./coverage-suggestions";

/** Cells per `upsertShifts` request; the route refuses more than 50. */
export const SCHEDULE_UPSERT_BATCH_SIZE = 50;
/** Batch requests one bulk change keeps in flight at once. */
export const SCHEDULE_WRITE_BATCHES_IN_FLIGHT = 3;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * One write per cell, the last one asked for. A plan can touch a cell twice
 * (a recurring fill, then a fix on the same day), and two saves of one cell
 * against the same version would refuse the second.
 */
export function lastWritePerCell(writes: readonly SuggestionWrite[]): SuggestionWrite[] {
  const byKey = new Map<string, SuggestionWrite>();
  for (const write of writes) {
    const key = `${write.employeeId}_${write.dateKey}`;
    byKey.delete(key);
    byKey.set(key, write);
  }
  return [...byKey.values()];
}

/**
 * An applied change without the cells that didn't save, so its Undo leaves
 * them alone rather than counting them as changed since.
 */
export function withoutUnsavedWrites(
  applied: { before: SuggestionWrite[]; writes: SuggestionWrite[] },
  unsaved: ReadonlySet<string>,
): { before: SuggestionWrite[]; writes: SuggestionWrite[] } {
  const keep = applied.writes.map((write) => !unsaved.has(`${write.employeeId}_${write.dateKey}`));
  return {
    before: applied.before.filter((_write, index) => keep[index]),
    writes: applied.writes.filter((_write, index) => keep[index]),
  };
}

/** Runs tasks with at most `limit` in flight, in the order they were handed over. */
export function createConcurrencyLimit(limit: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    running -= 1;
    waiting.shift()?.();
  };
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * How one cell of a bulk save ended. `row` is the cell as the server now holds
 * it (null for an empty cell), or undefined when the server didn't say.
 */
export type CellWriteOutcome<Row> =
  | { key: string; status: "saved"; row?: Row | null }
  | { key: string; status: "conflict"; row?: Row | null }
  | { key: string; status: "failed" };

/**
 * Settles a bulk save that was applied optimistically: a saved cell takes the
 * server's row, a conflicted one the server's current row, and a failed one
 * goes back to what it held before. A cell changed again since the optimistic
 * write is left alone, since a newer edit owns it.
 */
export function reconcileCellWrites<Row>(
  current: Readonly<Record<string, Row>>,
  outcomes: readonly CellWriteOutcome<Row>[],
  optimistic: ReadonlyMap<string, Row | null>,
  previous: ReadonlyMap<string, Row | undefined>,
): Record<string, Row> {
  let next: Record<string, Row> | null = null;
  const put = (key: string, value: Row | null | undefined) => {
    next ??= { ...current };
    if (value == null) delete next[key];
    else next[key] = value;
  };
  for (const outcome of outcomes) {
    if (!optimistic.has(outcome.key)) continue;
    const expected = optimistic.get(outcome.key) ?? undefined;
    if (current[outcome.key] !== expected) continue;
    if (outcome.status === "failed") put(outcome.key, previous.get(outcome.key));
    else if (outcome.row !== undefined) put(outcome.key, outcome.row);
  }
  return next ?? (current as Record<string, Row>);
}

export interface CellWriteTally {
  total: number;
  saved: number;
  failed: number;
  conflicts: number;
}

/** A settled bulk save: its counts, and the cells that didn't save. */
export interface CellWriteBatchResult extends CellWriteTally {
  unsaved: ReadonlySet<string>;
}

export function tallyCellWrites(
  outcomes: readonly { key: string; status: string }[],
): CellWriteBatchResult {
  const unsaved = new Set<string>();
  const tally = { total: outcomes.length, saved: 0, failed: 0, conflicts: 0, unsaved };
  for (const outcome of outcomes) {
    if (outcome.status === "saved") tally.saved += 1;
    else if (outcome.status === "conflict") tally.conflicts += 1;
    else tally.failed += 1;
    if (outcome.status !== "saved") unsaved.add(outcome.key);
  }
  return tally;
}

/** The one toast a bulk save shows when not every cell saved; null when all did. */
export function cellWriteBatchMessage(tally: CellWriteTally): string | null {
  const { total, saved, failed, conflicts } = tally;
  if (failed === 0 && conflicts === 0) return null;
  if (failed === 0) {
    if (total === 1) return "Someone else just changed this shift. Showing the latest version.";
    return `Someone else just changed ${conflicts} of these shifts. Showing the latest version.`;
  }
  const failedPart =
    total === 1
      ? "We couldn't save that shift, so it was put back."
      : saved === 0 && conflicts === 0
        ? `None of the ${total} shifts could be saved, so they were put back.`
        : `Saved ${saved} of ${total} shifts. ${failed} couldn't be saved, so ${failed === 1 ? "it was" : "they were"} put back.`;
  if (conflicts === 0) return failedPart;
  return `${failedPart} ${conflicts} ${conflicts === 1 ? "was" : "were"} just changed by someone else, so ${conflicts === 1 ? "it shows" : "they show"} the latest version.`;
}
