import type { OTAlert } from "@/lib/dashboard-stats";

interface AlertBannerProps {
  alerts: OTAlert[];
  onReview: () => void;
}

export default function AlertBanner({ alerts, onReview }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  const names = alerts.slice(0, 3).map((a) => a.empName);
  const extra = alerts.length > 3 ? ` and ${alerts.length - 3} more` : "";
  const nameStr = names.join(", ") + extra;

  return (
    <div
      style={{
        background: "var(--color-warning-bg)",
        border: "1px solid var(--color-warning-border)",
        borderRadius: 9,
        padding: "11px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          background: "var(--color-warning)",
          borderRadius: "50%",
          flexShrink: 0,
        }}
      />
      <span style={{ color: "var(--color-warning-text)", flex: 1 }}>
        <strong style={{ fontWeight: 600 }}>
          {alerts.length} overtime alert{alerts.length !== 1 ? "s" : ""}
        </strong>
        {" \u2014 "}
        {nameStr} {alerts.length === 1 ? "is" : "are"} projected to exceed 40h
        this week.
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-warning)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        onClick={onReview}
      >
        Review &rarr;
      </span>
    </div>
  );
}
