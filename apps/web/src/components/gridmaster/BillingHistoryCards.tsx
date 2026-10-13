"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchGridmasterBillingHistory,
  fetchGridmasterOrgSeatHistory,
  type GridmasterSeatHistoryRow,
} from "@/features/gridmaster/client";
import { gmTableStyle, gmTdStyle, gmThStyle } from "@/components/gridmaster/table-styles";
import { queryKeys } from "@/lib/query-keys";
import { sectionBodyStyle, sectionHeaderStyle, sectionStyle } from "@/lib/styles";

const SEAT_SOURCE_LABELS: Record<GridmasterSeatHistoryRow["source"], string> = {
  stripe: "Stripe",
  checkout: "Checkout",
  gridmaster: "Seat true-up",
  backfill: "Starting count",
};

const mutedStyle = { color: "var(--dg-color-text-muted)" } as const;

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Monthly revenue and seats across organizations, from the recorded history. */
export function BillingHistoryCard() {
  const historyQuery = useQuery({
    queryKey: queryKeys.gridmaster.billingHistory(),
    queryFn: fetchGridmasterBillingHistory,
    staleTime: 60_000,
  });
  const report = historyQuery.data;

  return (
    <div style={sectionStyle}>
      <div
        style={{
          ...sectionHeaderStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>Revenue and seats</span>
        {report?.since && (
          <span className="dg-tabular-nums" style={{ ...mutedStyle, fontWeight: 500 }}>
            Since {formatDay(report.since)}
          </span>
        )}
      </div>
      {!report ? (
        <div style={{ ...sectionBodyStyle, ...mutedStyle }}>
          {historyQuery.isError ? "We couldn't load the billing history." : "Loading…"}
        </div>
      ) : report.months.length === 0 ? (
        <div style={{ ...sectionBodyStyle, ...mutedStyle }}>
          No history recorded yet. Seat changes and invoices are recorded from now on.
        </div>
      ) : (
        <table style={gmTableStyle}>
          <thead>
            <tr>
              <th style={gmThStyle}>Month</th>
              <th style={gmThStyle}>Revenue</th>
              <th style={gmThStyle}>Failed invoices</th>
              <th style={gmThStyle}>Billed seats</th>
            </tr>
          </thead>
          <tbody>
            {[...report.months].reverse().map((month) => (
              <tr key={month.month}>
                <td style={gmTdStyle}>{formatMonth(month.month)}</td>
                <td className="dg-tabular-nums" style={gmTdStyle}>
                  {month.revenue.length === 0
                    ? "None"
                    : month.revenue
                        .map((entry) => formatMoney(entry.paidCents, entry.currency))
                        .join(", ")}
                </td>
                <td className="dg-tabular-nums" style={gmTdStyle}>
                  {month.failedInvoices}
                </td>
                <td className="dg-tabular-nums" style={gmTdStyle}>
                  {month.billedSeats}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** One organization's recent seat changes. */
export function OrgSeatHistoryCard({ orgId }: { orgId: string }) {
  const seatsQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgSeatHistory(orgId),
    queryFn: () => fetchGridmasterOrgSeatHistory(orgId),
    staleTime: 30_000,
  });
  const rows = seatsQuery.data?.seats;

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Seat history</div>
      {!rows ? (
        <div style={{ ...sectionBodyStyle, ...mutedStyle }}>
          {seatsQuery.isError ? "We couldn't load the seat history." : "Loading…"}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...sectionBodyStyle, ...mutedStyle }}>No seat changes recorded yet.</div>
      ) : (
        <table style={gmTableStyle}>
          <thead>
            <tr>
              <th style={gmThStyle}>Date</th>
              <th style={gmThStyle}>Billed seats</th>
              <th style={gmThStyle}>App users</th>
              <th style={gmThStyle}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.recorded_at}-${row.source}`}>
                <td className="dg-tabular-nums" style={gmTdStyle}>
                  {formatDay(row.recorded_at)}
                </td>
                <td className="dg-tabular-nums" style={gmTdStyle}>
                  {row.seats}
                </td>
                <td className="dg-tabular-nums" style={gmTdStyle}>
                  {row.billable_app_users ?? "Not counted"}
                </td>
                <td style={gmTdStyle}>{SEAT_SOURCE_LABELS[row.source] ?? row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
