import type { CSSProperties } from "react";

interface StatCardProps {
  label: string;
  dotColor: string;
  value: string | number;
  subtext: string;
  /** 0–100 */
  progress: number;
  progressColor: string;
  delta: number;
  deltaLabel: string;
  variant?: "default" | "danger";
}

export default function StatCard({
  label,
  dotColor,
  value,
  subtext,
  progress,
  progressColor,
  delta,
  deltaLabel,
  variant = "default",
}: StatCardProps) {
  const isUp = delta > 0;
  const isDown = delta < 0;
  const isNeutral = delta === 0;

  const isDanger = variant === "danger";
  // For danger cards (OT): up = bad (red), down = good (green)
  // For normal cards: up = good (green), down = bad (red)
  const isGood = isDanger ? isDown : isUp;
  const isBad = isDanger ? isUp : isDown;

  const deltaStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "2px 7px",
    borderRadius: 4,
    ...(isGood
      ? { background: "var(--color-success-bg, #F0FDF4)", color: "var(--color-success, #16A34A)" }
      : isBad
        ? { background: "var(--color-danger-bg, #FEF2F2)", color: "var(--color-danger, #DC2626)" }
        : { background: "var(--color-bg-secondary, #F1F5F9)", color: "var(--color-text-subtle, #64748B)" }),
  };

  // For OT alerts, "up" is bad (more OT), so swap the delta badge colors
  const deltaDisplay = isNeutral
    ? "\u2014 same"
    : `${isUp ? "\u2191" : "\u2193"} ${isUp ? "+" : ""}${delta}${typeof delta === "number" && deltaLabel.includes("%") ? "%" : ""}`;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 12,
          color: "var(--color-text-subtle)",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        {label}
      </div>

      {/* Value */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color:
            variant === "danger"
              ? "var(--color-danger, #DC2626)"
              : "var(--color-text-primary)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: "var(--color-border)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 4,
            borderRadius: 2,
            width: `${Math.min(100, Math.max(0, progress))}%`,
            background: progressColor,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Footer: subtext + delta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
          {subtext}
        </span>
        <span style={deltaStyle}>{deltaDisplay}</span>
      </div>
    </div>
  );
}
