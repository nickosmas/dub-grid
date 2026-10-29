import { describeSeatGap } from "@/features/billing/overview";
import { describeSeatBreakdown, type SeatBreakdownLine } from "@/features/billing/seats";
import type { SeatBreakdown } from "@/types";
import { BillingBanner, BillingCard, IconTile } from "./billing-ui";

const GROUP_COLORS: Record<SeatBreakdownLine["key"], string> = {
  active: "var(--dg-color-primary)",
  suspended: "var(--dg-color-danger)",
  "away-managing": "var(--dg-color-warning)",
  "management-only": "var(--dg-color-text-secondary)",
  away: "var(--dg-color-text-muted)",
  archived: "var(--dg-color-text-muted)",
};

function SeatDonut({ lines, total }: { lines: SeatBreakdownLine[]; total: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
      }}
    >
      <svg
        width={140}
        height={140}
        viewBox="0 0 140 140"
        role="img"
        aria-label={`${total} seats in use, by group`}
      >
        <circle
          cx={70}
          cy={70}
          r={radius}
          fill="none"
          stroke="var(--dg-color-surface-alt)"
          strokeWidth={16}
        />
        {total > 0 &&
          lines.map((line) => {
            const length = (line.count / total) * circumference;
            const gap = lines.length > 1 ? 2 : 0;
            const segment = (
              <circle
                key={line.key}
                cx={70}
                cy={70}
                r={radius}
                fill="none"
                stroke={GROUP_COLORS[line.key]}
                strokeWidth={16}
                strokeDasharray={`${Math.max(length - gap, 0)} ${circumference}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              >
                <title>{`${line.label}: ${line.count}`}</title>
              </circle>
            );
            offset += length;
            return segment;
          })}
        <text
          x="50%"
          y={80}
          textAnchor="middle"
          className="dg-tabular-nums"
          style={{ fontSize: 30, fontWeight: 700, fill: "var(--dg-color-text-primary)" }}
        >
          {total}
        </text>
      </svg>
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 500,
          color: "var(--dg-color-text-muted)",
        }}
      >
        Seats in use
      </span>
    </div>
  );
}

function SeatTerm({
  value,
  name,
  detail,
  icon,
  filled,
}: {
  value: number;
  name: string;
  detail: string;
  icon: "users" | "receipt";
  filled: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 14px",
        border: "1px solid var(--dg-color-border-light)",
        borderRadius: "var(--dg-radius-lg)",
      }}
    >
      <IconTile icon={icon} tone={filled ? "info" : "neutral"} size={36} />
      <div style={{ minWidth: 0 }}>
        <div className="dg-tabular-nums" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ marginTop: 4, fontSize: "var(--dg-fs-label)", fontWeight: 600 }}>{name}</div>
        <div
          style={{
            marginTop: 3,
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-muted)",
            lineHeight: 1.45,
          }}
        >
          {detail}
        </div>
      </div>
    </div>
  );
}

export function BillingSeatsCard({
  breakdown,
  paidSeats,
}: {
  breakdown: SeatBreakdown;
  paidSeats: number | null;
}) {
  const { billed, notBilled } = describeSeatBreakdown(breakdown);
  const shown = billed.filter((line) => line.count > 0 || line.key === "active");
  const notBilledCount = notBilled.reduce((sum, line) => sum + line.count, 0);
  const gap = describeSeatGap(breakdown.total, paidSeats);
  const gapTone =
    paidSeats == null || breakdown.total === paidSeats
      ? "success"
      : breakdown.total > paidSeats
        ? "warning"
        : "info";

  return (
    <BillingCard
      icon="users"
      title="Seats"
      headingId="billing-seats-heading"
      aside={
        <span
          style={{
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 500,
            color: "var(--dg-color-text-muted)",
          }}
        >
          {breakdown.total} in use, {notBilledCount} not billed
        </span>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        {paidSeats != null && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SeatTerm
              value={breakdown.total}
              name="Seats in use"
              detail="Everyone who takes a seat today."
              icon="users"
              filled
            />
            <SeatTerm
              value={paidSeats}
              name="Paid seats"
              detail="The seats on your subscription. This is the number you're charged for each month."
              icon="receipt"
              filled={false}
            />
          </div>
        )}
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

        <div>
          <p
            style={{
              margin: "0 0 14px",
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            You&apos;re billed for each seat in use. Here&apos;s who takes one.
          </p>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <SeatDonut lines={shown} total={breakdown.total} />
            <ul
              className="w-full sm:flex-1"
              style={{ listStyle: "none", margin: 0, padding: 0, minWidth: 0 }}
            >
              {shown.map((line, index) => (
                <li
                  key={line.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "12px minmax(0, 1fr) auto 42px",
                    gap: "2px 10px",
                    alignItems: "start",
                    padding: index === 0 ? "0 0 10px" : "10px 0",
                    borderTop: index === 0 ? undefined : "1px solid var(--dg-color-border-light)",
                    fontSize: "var(--dg-fs-label)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      marginTop: 4,
                      background: GROUP_COLORS[line.key],
                    }}
                  />
                  <span>
                    <span style={{ fontWeight: 600, color: "var(--dg-color-text-primary)" }}>
                      {line.label}
                    </span>
                    {line.detail && (
                      <span
                        style={{
                          display: "block",
                          marginTop: 1,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          lineHeight: 1.4,
                        }}
                      >
                        {line.detail}
                      </span>
                    )}
                  </span>
                  <span className="dg-tabular-nums" style={{ fontWeight: 600, textAlign: "right" }}>
                    {line.count}
                  </span>
                  <span
                    className="dg-tabular-nums"
                    style={{ color: "var(--dg-color-text-muted)", textAlign: "right" }}
                  >
                    {breakdown.total > 0
                      ? `${Math.round((line.count / breakdown.total) * 100)}%`
                      : "0%"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {notBilled.length > 0 && (
          <div>
            <div className="dg-type-content-group-heading" style={{ marginBottom: 8 }}>
              Not billed
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
              {notBilled.map((line) => (
                <div
                  key={line.key}
                  style={{
                    minWidth: 0,
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    border: "1px dashed var(--dg-color-border-strong)",
                    borderRadius: "var(--dg-radius-lg)",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600 }}>
                      {line.label}
                    </span>
                    {line.detail && (
                      <span
                        style={{
                          display: "block",
                          marginTop: 1,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          lineHeight: 1.4,
                        }}
                      >
                        {line.detail}
                      </span>
                    )}
                  </span>
                  <span
                    className="dg-tabular-nums"
                    style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700 }}
                  >
                    {line.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BillingCard>
  );
}
