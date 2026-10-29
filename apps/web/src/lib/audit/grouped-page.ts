import type { AuditRow } from "./enrich";
import { splitActivityRuns, type GroupableActivity } from "./grouping";

export const GROUPED_FETCH_CHUNK = 500;
/** A run longer than this splits across pages rather than stall one request. */
export const GROUPED_FETCH_MAX_ROWS = 5000;

type IndexedActivity = GroupableActivity & { index: number };

function runsOf(rows: AuditRow[]): IndexedActivity[][] {
  return splitActivityRuns(
    rows.map((row, index) => ({
      index,
      action: String(row.action ?? ""),
      actorId: typeof row.actor_id === "string" ? row.actor_id : null,
      orgId: typeof row.org_id === "string" ? row.org_id : null,
      createdAt: String(row.created_at ?? ""),
    })),
  );
}

/**
 * Reads newest-first rows from `offset` until the page holds `limit` entries,
 * a grouped run counting once, and the run that ends the page has closed, so
 * pages count entries and no run is split between two of them.
 */
export async function collectGroupedPage(
  fetchRows: (offset: number, limit: number) => Promise<AuditRow[]>,
  { offset, limit }: { offset: number; limit: number },
): Promise<{ rows: AuditRow[]; nextOffset: number | null }> {
  const rows: AuditRow[] = [];
  for (;;) {
    const chunk = await fetchRows(offset + rows.length, GROUPED_FETCH_CHUNK);
    rows.push(...chunk);
    const next = trimmedNextOffset(rows, offset, limit);
    if (next !== undefined) return { rows: rows.slice(0, next - offset), nextOffset: next };
    if (chunk.length < GROUPED_FETCH_CHUNK) return { rows, nextOffset: null };
    if (rows.length >= GROUPED_FETCH_MAX_ROWS) {
      return { rows, nextOffset: offset + rows.length };
    }
  }
}

/** Where the next page starts once more than `limit` runs are known, else undefined. */
function trimmedNextOffset(rows: AuditRow[], offset: number, limit: number): number | undefined {
  const runs = runsOf(rows);
  if (runs.length <= limit) return undefined;
  const used = runs.slice(0, limit).reduce((total, run) => total + run.length, 0);
  return offset + used;
}
