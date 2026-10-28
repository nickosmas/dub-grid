import type { BillingStat } from "@/features/billing/overview";
import { IconTile } from "./billing-ui";

// Spelled out so Tailwind sees each class.
const WIDE_COLUMNS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

export function BillingStatCards({ stats }: { stats: BillingStat[] }) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 ${WIDE_COLUMNS[stats.length] ?? "md:grid-cols-4"} [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1`}
    >
      {stats.map((stat) => (
        <div
          key={stat.key}
          data-stat-card
          style={{
            background: "var(--dg-color-surface)",
            border: "1px solid var(--dg-color-border-light)",
            borderRadius: "var(--dg-radius-lg)",
            padding: "12px 14px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                minWidth: 0,
                fontSize: "var(--dg-type-metadata-size)",
                color: "var(--dg-type-metadata-color)",
                fontWeight: 500,
              }}
            >
              {stat.label}
            </span>
            <IconTile icon={stat.icon} tone={stat.tone} />
          </div>
          <span
            className="dg-tabular-nums"
            style={{
              fontSize: "clamp(1.45rem, 1.8vw, 1.85rem)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {stat.value}
          </span>
          <span
            style={{
              marginTop: 6,
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              lineHeight: 1.4,
            }}
          >
            {stat.detail}
          </span>
        </div>
      ))}
    </div>
  );
}
