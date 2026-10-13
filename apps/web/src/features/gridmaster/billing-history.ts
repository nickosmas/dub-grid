export interface InvoiceEventRow {
  org_id: string;
  kind: "paid" | "failed";
  amount_cents: number;
  currency: string;
  occurred_at: string;
}

export interface SeatHistoryRow {
  org_id: string;
  seats: number;
  recorded_at: string;
}

export interface BillingHistoryMonth {
  /** `YYYY-MM`, in UTC. */
  month: string;
  /** Paid amounts, one entry per currency, largest first. */
  revenue: Array<{ currency: string; paidCents: number }>;
  failedInvoices: number;
  /** Seats billed at the month's end (or now, for this month), across organizations. */
  billedSeats: number;
}

export interface BillingHistoryReport {
  /** The first recorded row; null when nothing has been recorded yet. */
  since: string | null;
  /** Oldest first, never before `since`. */
  months: BillingHistoryMonth[];
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function billedSeatsAt(rows: SeatHistoryRow[], at: number): number {
  const latest = new Map<string, { at: number; seats: number }>();
  for (const row of rows) {
    const recorded = Date.parse(row.recorded_at);
    if (recorded > at) continue;
    const current = latest.get(row.org_id);
    if (!current || recorded >= current.at)
      latest.set(row.org_id, { at: recorded, seats: row.seats });
  }
  let total = 0;
  for (const { seats } of latest.values()) total += seats;
  return total;
}

/**
 * Monthly revenue, failed invoices, and billed seats for the last `months`
 * months, starting no earlier than the first recorded row so the report never
 * implies history it doesn't have.
 */
export function summarizeBillingHistory(
  invoices: InvoiceEventRow[],
  seats: SeatHistoryRow[],
  options: { now?: Date; months?: number; firstRecordedAt?: string | null } = {},
): BillingHistoryReport {
  const now = options.now ?? new Date();
  // The caller may pass only recent invoices, so it says where history begins.
  const recorded = [
    ...(options.firstRecordedAt ? [Date.parse(options.firstRecordedAt)] : []),
    ...invoices.map((row) => Date.parse(row.occurred_at)),
    ...seats.map((row) => Date.parse(row.recorded_at)),
  ].filter((value) => Number.isFinite(value));
  if (recorded.length === 0) return { since: null, months: [] };

  const since = new Date(Math.min(...recorded));
  const windowStart = addMonths(startOfMonth(now), -((options.months ?? 12) - 1));
  let cursor = since > windowStart ? startOfMonth(since) : windowStart;

  const months: BillingHistoryMonth[] = [];
  while (cursor <= now) {
    const next = addMonths(cursor, 1);
    const key = monthKey(cursor);
    const paid = new Map<string, number>();
    let failedInvoices = 0;
    for (const row of invoices) {
      if (row.occurred_at.slice(0, 7) !== key) continue;
      if (row.kind === "failed") failedInvoices += 1;
      else paid.set(row.currency, (paid.get(row.currency) ?? 0) + row.amount_cents);
    }
    months.push({
      month: key,
      revenue: [...paid]
        .map(([currency, paidCents]) => ({ currency, paidCents }))
        .sort((a, b) => b.paidCents - a.paidCents),
      failedInvoices,
      billedSeats: billedSeatsAt(seats, Math.min(next.getTime() - 1, now.getTime())),
    });
    cursor = next;
  }

  return { since: since.toISOString(), months };
}
