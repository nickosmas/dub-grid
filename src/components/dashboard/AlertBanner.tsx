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
        background: "#FFFBEB",
        border: "1px solid #FDE68A",
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
          background: "#D97706",
          borderRadius: "50%",
          flexShrink: 0,
        }}
      />
      <span style={{ color: "#92400E", flex: 1 }}>
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
          color: "#D97706",
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
