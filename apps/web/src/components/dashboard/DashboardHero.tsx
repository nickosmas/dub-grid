import Link from "next/link";

type DashboardHeroMetric = {
  label: string;
  value: string;
  detail?: string;
  href?: string;
};

interface DashboardHeroProps {
  headline: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  metrics?: DashboardHeroMetric[];
}

type AccentTone = {
  iconBg: string;
  iconColor: string;
};

function getMetricAccent(label: string): AccentTone {
  const key = label.toLowerCase();

  if (key.includes("coverage")) {
    return {
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
    };
  }

  if (key.includes("gap")) {
    return {
      iconBg: "#fee2e2",
      iconColor: "#b91c1c",
    };
  }

  if (key.includes("approval")) {
    return {
      iconBg: "#fef3c7",
      iconColor: "#b45309",
    };
  }

  return {
    iconBg: "#dbeafe",
    iconColor: "#1d4ed8",
  };
}

function MetricIcon({ label, color }: { label: string; color: string }) {
  const key = label.toLowerCase();

  if (key.includes("coverage")) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2.5l5 2v4.3c0 3.3-2.1 5.6-5 6.7-2.9-1.1-5-3.4-5-6.7V4.5l5-2Z" />
        <path d="m6.4 8.9 1.7 1.7 3.6-3.8" />
      </svg>
    );
  }

  if (key.includes("gap")) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="6.25" />
        <path d="M9 5.8v3.6" />
        <path d="M9 12.3h.01" />
      </svg>
    );
  }

  if (key.includes("approval")) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.2 3.2h7.6a1.6 1.6 0 0 1 1.6 1.6v8.4a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6V4.8a1.6 1.6 0 0 1 1.6-1.6Z" />
        <path d="m6.4 9 1.6 1.6 3.7-3.8" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 13.5h10" />
      <path d="M5.5 13.5V8.2" />
      <path d="M9 13.5V4.8" />
      <path d="M12.5 13.5V6.4" />
    </svg>
  );
}

export default function DashboardHero({
  headline,
  description,
  actionLabel,
  actionHref,
  metrics,
}: DashboardHeroProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: "14px 16px",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-xl)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(1.25rem, 1.5vw, 1.7rem)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            {headline}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--color-text-muted)",
              fontSize: "var(--dg-fs-body-sm, 14px)",
              maxWidth: 780,
              lineHeight: 1.45,
            }}
          >
            {description}
          </p>
        </div>
        <Link
          href={actionHref}
          className="dg-btn dg-btn-brand"
          style={{ whiteSpace: "nowrap", alignSelf: "center" }}
        >
          {actionLabel}
        </Link>
      </div>

      {metrics?.length ? (
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ metric }: { metric: DashboardHeroMetric }) {
  const accent = getMetricAccent(metric.label);

  const card = (
    <div
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-lg)",
        padding: "12px 14px",
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
        <div
          style={{
            minWidth: 0,
            fontSize: "11px",
            color: "var(--color-text-muted)",
          }}
        >
          {metric.label}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: accent.iconBg,
            flexShrink: 0,
          }}
        >
          <MetricIcon label={metric.label} color={accent.iconColor} />
        </div>
      </div>
      <div
        style={{
          fontSize: "clamp(1.45rem, 1.8vw, 1.85rem)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.04em",
        }}
      >
        {metric.value}
      </div>
      {metric.detail ? (
        <div
          style={{
            marginTop: 4,
            fontSize: "11px",
            color: "var(--color-text-muted)",
            lineHeight: 1.4,
          }}
        >
          {metric.detail}
        </div>
      ) : null}
    </div>
  );

  if (!metric.href) {
    return card;
  }

  return (
    <Link
      href={metric.href}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
      aria-label={`${metric.label}: ${metric.value}`}
    >
      {card}
    </Link>
  );
}
