import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";

export interface AuditDayCounts {
  /** Calendar day in the organization's zone to the number of events on it. */
  counts: Record<string, number>;
  total: number;
  /** More rows exist than the query would return, so the counts are a floor. */
  truncated: boolean;
}

/**
 * Buckets audit timestamps into the organization's calendar days.
 *
 * The rows arrive as bare timestamps, so this is the one place the period's
 * true shape is known: a page of rows only describes the page.
 */
export function bucketAuditDays(
  rows: Array<{ created_at?: unknown }>,
  timeZone: string | null,
  limit: number,
): AuditDayCounts {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const value = typeof row.created_at === "string" ? row.created_at : null;
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const dateKey = getIsoDateInTimeZone(date, timeZone);
    counts[dateKey] = (counts[dateKey] ?? 0) + 1;
  }

  return { counts, total: rows.length, truncated: rows.length >= limit };
}
