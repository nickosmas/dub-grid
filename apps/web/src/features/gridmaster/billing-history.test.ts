import { describe, expect, it } from "vitest";
import {
  summarizeBillingHistory,
  type InvoiceEventRow,
  type SeatHistoryRow,
} from "./billing-history";

const now = new Date("2026-10-13T12:00:00Z");

function paid(org: string, cents: number, at: string, currency = "usd"): InvoiceEventRow {
  return { org_id: org, kind: "paid", amount_cents: cents, currency, occurred_at: at };
}

describe("summarizeBillingHistory", () => {
  it("says there is no history yet", () => {
    expect(summarizeBillingHistory([], [], { now })).toEqual({ since: null, months: [] });
  });

  it("starts at the first recorded row, not before", () => {
    const report = summarizeBillingHistory(
      [],
      [{ org_id: "a", seats: 5, recorded_at: "2026-09-20T00:00:00Z" }],
      { now },
    );
    expect(report.since).toBe("2026-09-20T00:00:00.000Z");
    expect(report.months.map((month) => month.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("keeps to the last months asked for", () => {
    const report = summarizeBillingHistory([paid("a", 100, "2025-01-15T00:00:00Z")], [], {
      now,
      months: 3,
    });
    expect(report.since).toBe("2025-01-15T00:00:00.000Z");
    expect(report.months.map((month) => month.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("buckets invoices by UTC month and currency, counting failures", () => {
    const invoices: InvoiceEventRow[] = [
      paid("a", 4000, "2026-09-30T23:59:59Z"),
      paid("a", 5000, "2026-10-01T00:00:00Z"),
      paid("b", 3000, "2026-10-05T00:00:00Z"),
      paid("c", 9000, "2026-10-06T00:00:00Z", "eur"),
      {
        org_id: "b",
        kind: "failed",
        amount_cents: 3000,
        currency: "usd",
        occurred_at: "2026-10-02T00:00:00Z",
      },
    ];
    const [september, october] = summarizeBillingHistory(invoices, [], { now }).months;

    expect(september).toMatchObject({
      month: "2026-09",
      revenue: [{ currency: "usd", paidCents: 4000 }],
      failedInvoices: 0,
    });
    expect(october).toMatchObject({
      month: "2026-10",
      revenue: [
        { currency: "eur", paidCents: 9000 },
        { currency: "usd", paidCents: 8000 },
      ],
      failedInvoices: 1,
    });
  });

  it("carries each organization's latest seats into later months", () => {
    const seats: SeatHistoryRow[] = [
      { org_id: "a", seats: 5, recorded_at: "2026-08-10T00:00:00Z" },
      { org_id: "b", seats: 3, recorded_at: "2026-09-01T00:00:00Z" },
      { org_id: "a", seats: 8, recorded_at: "2026-09-15T00:00:00Z" },
      { org_id: "b", seats: 4, recorded_at: "2026-10-12T00:00:00Z" },
    ];
    const report = summarizeBillingHistory([], seats, { now });

    expect(report.months.map((month) => [month.month, month.billedSeats])).toEqual([
      ["2026-08", 5],
      ["2026-09", 11],
      ["2026-10", 12],
    ]);
  });
});
