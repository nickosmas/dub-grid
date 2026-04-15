import Link from "next/link";
import type { Permissions } from "@/hooks";

interface DashboardStatusBarProps {
  coveragePct: number;
  otAlertCount: number;
  pendingApprovalCount: number;
  draftCount: number;
  urgentGapCount: number;
  hasRequirements: boolean;
  permissions: Permissions;
  onExpandStats: () => void;
}

type OverallStatus = "green" | "amber" | "red";

function computeOverallStatus({
  coveragePct,
  otAlertCount,
  pendingApprovalCount,
  urgentGapCount,
  hasRequirements,
}: Pick<DashboardStatusBarProps, "coveragePct" | "otAlertCount" | "pendingApprovalCount" | "urgentGapCount" | "hasRequirements">): {
  status: OverallStatus;
  label: string;
} {
  const issues: string[] = [];

  if (urgentGapCount > 0) issues.push("urgent gaps");
  if (otAlertCount > 0) issues.push("OT alerts");
  if (pendingApprovalCount > 0) issues.push("pending approvals");
  if (hasRequirements && coveragePct < 90) issues.push("low coverage");

  if (issues.length === 0) {
    return { status: "green", label: "All clear this week" };
  }

  const hasRed = urgentGapCount > 0 || (hasRequirements && coveragePct < 70);
  const count = issues.length;

  return {
    status: hasRed ? "red" : "amber",
    label: `${count} item${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} attention`,
  };
}

const STATUS_COLORS: Record<OverallStatus, string> = {
  green: "var(--color-success)",
  amber: "var(--color-warning)",
  red: "var(--color-danger)",
};

function chipColor(value: number, thresholds: { green: number; amber: number }, invert = false): string {
  if (invert) {
    // Higher is worse (OT, gaps)
    return value === 0 ? "var(--color-text-subtle)" : value <= thresholds.amber ? "var(--color-warning)" : "var(--color-danger)";
  }
  // Higher is better (coverage)
  return value >= thresholds.green ? "var(--color-success-text)" : value >= thresholds.amber ? "var(--color-warning)" : "var(--color-danger)";
}

export default function DashboardStatusBar({
  coveragePct,
  otAlertCount,
  pendingApprovalCount,
  urgentGapCount,
  hasRequirements,
  onExpandStats,
}: DashboardStatusBarProps) {
  const { status, label } = computeOverallStatus({
    coveragePct,
    otAlertCount,
    pendingApprovalCount,
    urgentGapCount,
    hasRequirements,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--dg-space-lg)",
        padding: "var(--dg-space-sm) var(--dg-space-lg)",
        borderRadius: "var(--dg-radius-md)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-light)",
        flexWrap: "wrap",
      }}
    >
      {/* Status indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--dg-space-sm)", marginRight: "var(--dg-space-xs)" }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: STATUS_COLORS[status],
            flexShrink: 0,
            boxShadow: status !== "green" ? `0 0 6px ${STATUS_COLORS[status]}40` : undefined,
          }}
        />
        <span
          style={{
            fontSize: "var(--dg-fs-body)",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: "var(--dg-space-xl)", background: "var(--color-border-light)", flexShrink: 0 }} />

      {/* Metric chips - streamlined to only show what ActionQueueCard doesn't */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--dg-space-md)", flexWrap: "wrap", flex: 1 }}>
        {hasRequirements && (
          <MetricChip
            label="Coverage"
            value={`${Math.round(coveragePct)}%`}
            color={chipColor(coveragePct, { green: 90, amber: 70 })}
          />
        )}

        {urgentGapCount > 0 && (
          <MetricChip
            label="Urgent gaps"
            value={String(urgentGapCount)}
            color="var(--color-danger)"
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--dg-space-sm)", flexShrink: 0 }}>
        <button
          onClick={onExpandStats}
          style={{
            fontSize: "var(--dg-fs-small)",
            fontWeight: 500,
            color: "var(--color-text-subtle)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "var(--dg-space-xs) var(--dg-space-sm)",
            borderRadius: "var(--dg-radius-sm)",
            whiteSpace: "nowrap",
          }}
        >
          View trends
        </button>
        <Link
          href="/schedule"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--dg-space-xs)",
            padding: "var(--dg-space-xs) var(--dg-space-md)",
            borderRadius: "var(--dg-radius-sm)",
            fontSize: "var(--dg-fs-small)",
            fontWeight: 600,
            textDecoration: "none",
            background: "var(--color-primary)",
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          Go to schedule
          <span style={{ fontSize: 11 }}>&rarr;</span>
        </Link>
      </div>
    </div>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: "var(--dg-fs-micro)", fontWeight: 500, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}
