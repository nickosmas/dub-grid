import type { BillingPaymentSummary, SeatHistoryMonth } from "@/types";

export interface SeatHistoryRow {
  seats: number;
  billable_app_users: number | null;
  recorded_at: string;
}

export interface InvoiceEventRow {
  kind: "paid" | "failed";
  amount_cents: number;
  currency: string;
  occurred_at: string;
}

const MAX_MONTHS = 24;

function monthKey(iso: string | Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" })
      .format(new Date(iso))
      .slice(0, 7);
  } catch {
    return new Date(iso).toISOString().slice(0, 7);
  }
}

function nextMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Month by month from the first seat change to now: the seats paid for at each
 * month's end and, when they were counted, the seats in use. The current month
 * reads today's numbers.
 */
export function buildSeatHistory(
  seatRows: readonly SeatHistoryRow[],
  invoiceRows: readonly InvoiceEventRow[],
  options: {
    now: Date;
    timeZone: string;
    current: { paidSeats: number | null; seatsInUse: number };
  },
): SeatHistoryMonth[] {
  if (seatRows.length === 0) return [];
  const rows = [...seatRows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const keyed = rows.map((row) => ({ ...row, month: monthKey(row.recorded_at, options.timeZone) }));
  const currentMonth = monthKey(options.now, options.timeZone);

  const months: string[] = [];
  for (let key = keyed[0].month; key <= currentMonth; key = nextMonth(key)) months.push(key);

  const paid = new Map<string, { cents: number; currency: string }>();
  for (const invoice of invoiceRows) {
    if (invoice.kind !== "paid") continue;
    const key = monthKey(invoice.occurred_at, options.timeZone);
    const entry = paid.get(key);
    paid.set(key, {
      cents: (entry?.cents ?? 0) + invoice.amount_cents,
      currency: entry?.currency ?? invoice.currency,
    });
  }

  let paidSeats: number | null = null;
  let index = 0;
  const history = months.map((month) => {
    let seatsInUse: number | null = null;
    while (index < keyed.length && keyed[index].month <= month) {
      paidSeats = keyed[index].seats;
      if (keyed[index].month === month && keyed[index].billable_app_users != null) {
        seatsInUse = keyed[index].billable_app_users;
      }
      index += 1;
    }
    const isCurrent = month === currentMonth;
    return {
      month,
      paidSeats: isCurrent ? (options.current.paidSeats ?? paidSeats) : paidSeats,
      seatsInUse: isCurrent ? options.current.seatsInUse : seatsInUse,
      paidCents: paid.get(month)?.cents ?? 0,
      currency: paid.get(month)?.currency ?? null,
      isCurrent,
    };
  });
  return history.slice(-MAX_MONTHS);
}

/** The latest paid invoice, and a failed one still waiting when it is newer. */
export function summarizePayments(invoiceRows: readonly InvoiceEventRow[]): {
  lastPayment: BillingPaymentSummary | null;
  outstandingPayment: BillingPaymentSummary | null;
} {
  const latest = (kind: "paid" | "failed") =>
    invoiceRows
      .filter((row) => row.kind === kind)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  const toSummary = (row: InvoiceEventRow | undefined): BillingPaymentSummary | null =>
    row
      ? {
          kind: row.kind,
          amountCents: row.amount_cents,
          currency: row.currency,
          occurredAt: row.occurred_at,
        }
      : null;
  const paid = latest("paid");
  const failed = latest("failed");
  return {
    lastPayment: toSummary(paid),
    outstandingPayment:
      failed && (!paid || failed.occurred_at > paid.occurred_at) ? toSummary(failed) : null,
  };
}

export function monthLabel(month: string, style: "short" | "long"): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString(
    undefined,
    style === "short" ? { month: "short" } : { month: "long", year: "numeric" },
  );
}

/** One month's seats, said in full for the chart's hover and the table. */
export function describeSeatHistoryMonth(entry: SeatHistoryMonth): string {
  const verb = entry.isCurrent ? "are" : "were";
  const paid =
    entry.paidSeats == null
      ? null
      : `${entry.paidSeats} ${entry.paidSeats === 1 ? "seat" : "seats"}`;
  if (entry.seatsInUse == null) {
    return paid
      ? `${paid} ${verb} paid for. Seats in use weren't counted that month.`
      : "No seats were recorded that month.";
  }
  const inUse = `${entry.seatsInUse} ${entry.seatsInUse === 1 ? "seat" : "seats"} ${verb} in use`;
  if (entry.paidSeats == null) return `${inUse}.`;
  const gap = entry.seatsInUse - entry.paidSeats;
  const difference =
    gap > 0
      ? ` ${gap} of them ${entry.isCurrent ? "aren't" : "weren't"} paid for yet.`
      : gap < 0
        ? ` ${-gap === 1 ? `1 paid seat ${entry.isCurrent ? "isn't" : "wasn't"}` : `${-gap} paid seats ${entry.isCurrent ? "aren't" : "weren't"}`} in use.`
        : "";
  return `${inUse}, and ${paid} ${verb} paid for.${difference}`;
}

/** The sentence above the chart: how seats in use moved over the months shown. */
export function describeSeatHistory(history: readonly SeatHistoryMonth[]): string | null {
  const counted = history.filter((entry) => entry.seatsInUse != null);
  if (counted.length === 0) return null;
  const first = counted[0];
  const last = counted[counted.length - 1];
  if (first === last) {
    return `${last.seatsInUse} seats are in use in ${monthLabel(last.month, "long")}.`;
  }
  const from = `${first.seatsInUse} in ${monthLabel(first.month, "long")}`;
  const to = `${last.seatsInUse} in ${monthLabel(last.month, "long")}`;
  const movement =
    last.seatsInUse! > first.seatsInUse!
      ? `rose from ${from} to ${to}`
      : last.seatsInUse! < first.seatsInUse!
        ? `fell from ${from} to ${to}`
        : `stayed at ${last.seatsInUse} from ${monthLabel(first.month, "long")} to ${monthLabel(last.month, "long")}`;
  return `Seats in use ${movement}.`;
}
