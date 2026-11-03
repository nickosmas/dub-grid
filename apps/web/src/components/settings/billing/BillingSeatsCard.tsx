import { describeSeatGap } from "@/features/billing/overview";
import { describeSeatBreakdown, type SeatBreakdownLine } from "@/features/billing/seats";
import type { SeatBreakdown } from "@/types";
import { BillingBanner, BillingCard } from "./billing-ui";

function GroupLines({ lines }: { lines: SeatBreakdownLine[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {lines.map((line, index) => (
        <li
          key={line.key}
          style={{
            padding: index === 0 ? "0 0 8px" : "8px 0",
            borderTop: index === 0 ? undefined : "1px solid var(--dg-color-border-light)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
            }}
          >
            <span style={{ minWidth: 0 }}>{line.label}</span>
            <span className="dg-tabular-nums">{line.count}</span>
          </div>
          {line.detail && <Detail>{line.detail}</Detail>}
        </li>
      ))}
    </ul>
  );
}

function Detail({ children }: { children: string }) {
  return (
    <div
      style={{
        marginTop: 2,
        fontSize: "var(--dg-fs-caption)",
        color: "var(--dg-color-text-muted)",
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function SeatCard({
  label,
  value,
  detail,
  lines,
  dashed = false,
}: {
  label: string;
  value: number;
  detail?: string;
  lines?: SeatBreakdownLine[];
  dashed?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 16,
        border: `1px ${dashed ? "dashed var(--dg-color-border-strong)" : "solid var(--dg-color-border-light)"}`,
        borderRadius: "var(--dg-radius-lg)",
      }}
    >
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 600,
          color: "var(--dg-color-text-muted)",
        }}
      >
        {label}
      </span>
      <span className="dg-tabular-nums" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
        {value}
      </span>
      {detail && <Detail>{detail}</Detail>}
      {lines && <GroupLines lines={lines} />}
    </div>
  );
}

/** One group says itself in a sentence; several are listed with their counts. */
function describeGroups(lines: SeatBreakdownLine[], lead?: string) {
  if (lines.length === 1) {
    const [line] = lines;
    const detail =
      line.key === "active"
        ? "Everyone on staff with an Active status takes a seat, whether or not they have an account."
        : `${line.label}. ${line.detail ?? ""}`;
    return { detail: [lead, detail].filter(Boolean).join(" ").trim() };
  }
  return { detail: lead, lines };
}

export function BillingSeatsCard({
  breakdown,
  paidSeats,
}: {
  breakdown: SeatBreakdown;
  paidSeats: number | null;
}) {
  const { billed, notBilled } = describeSeatBreakdown(breakdown);
  const inUse = billed.filter((line) => line.count > 0 || line.key === "active");
  const notBilledCount = notBilled.reduce((sum, line) => sum + line.count, 0);
  const gap = describeSeatGap(breakdown.total, paidSeats);
  const gapTone =
    paidSeats == null || breakdown.total === paidSeats
      ? "success"
      : breakdown.total > paidSeats
        ? "warning"
        : "info";
  const cardCount = 1 + (paidSeats != null ? 1 : 0) + (notBilled.length > 0 ? 1 : 0);

  return (
    <BillingCard icon="users" title="Seats" headingId="billing-seats-heading">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          className={`grid grid-cols-1 gap-3 ${
            cardCount === 3 ? "sm:grid-cols-3" : cardCount === 2 ? "sm:grid-cols-2" : ""
          }`}
        >
          <SeatCard
            label="Seats in use"
            value={breakdown.total}
            {...describeGroups(
              inUse,
              paidSeats == null ? "You're billed for each one." : undefined,
            )}
          />
          {paidSeats != null && (
            <SeatCard
              label="Paid seats"
              value={paidSeats}
              detail="The number you're charged for each month."
            />
          )}
          {notBilled.length > 0 && (
            <SeatCard
              label="Not billed"
              value={notBilledCount}
              dashed
              {...describeGroups(notBilled)}
            />
          )}
        </div>
        {gap && (
          <BillingBanner
            tone={gapTone}
            icon={
              gapTone === "success" ? "check" : gapTone === "warning" ? "user-plus" : "user-minus"
            }
          >
            {gap}
          </BillingBanner>
        )}
      </div>
    </BillingCard>
  );
}
