import Link from "next/link";
import { Check } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface DraftStatusCardProps {
  newCount: number;
  modifiedCount: number;
  deletedCount: number;
}

export default function DraftStatusCard({
  newCount,
  modifiedCount,
  deletedCount,
}: DraftStatusCardProps) {
  const total = newCount + modifiedCount + deletedCount;

  if (total === 0) {
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Draft status</div>
            <div className="dg-card-subtitle">Schedule changes</div>
          </div>
        </div>
        <div className="dg-card-body">
          <EmptyState
            size="inline"
            icon={<Check size={18} />}
            title="No unpublished changes"
          />
        </div>
      </div>
    );
  }

  const chips: { label: string; count: number; bg: string; color: string; border: string }[] = [];
  if (newCount > 0)
    chips.push({ label: "new", count: newCount, bg: "var(--color-success-bg)", color: "var(--color-success-text)", border: "var(--color-success-border)" });
  if (modifiedCount > 0)
    chips.push({ label: "modified", count: modifiedCount, bg: "var(--color-info-bg)", color: "var(--color-info)", border: "var(--color-info-border)" });
  if (deletedCount > 0)
    chips.push({ label: "deleted", count: deletedCount, bg: "var(--color-danger-bg)", color: "var(--color-danger)", border: "var(--color-danger-border)" });

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Draft status</div>
          <div className="dg-card-subtitle">
            {total} unpublished change{total !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <div className="dg-card-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {chips.map((chip) => (
            <span
              key={chip.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: chip.bg,
                color: chip.color,
                border: `1px solid ${chip.border}`,
              }}
            >
              {chip.count} {chip.label}
            </span>
          ))}
        </div>
        <Link
          href="/schedule"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-primary)",
            textDecoration: "none",
          }}
        >
          Go to schedule &rarr;
        </Link>
      </div>
    </div>
  );
}
