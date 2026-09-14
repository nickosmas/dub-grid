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
      iconBg: "var(--dg-color-brand-bg)",
      iconColor: "var(--dg-color-brand)",
    };
  }

  if (key.includes("gap")) {
    return {
      iconBg: "var(--dg-color-danger-bg)",
      iconColor: "var(--dg-color-danger-text)",
    };
  }

  if (key.includes("approval")) {
    return {
      iconBg: "var(--dg-color-warning-bg)",
      iconColor: "var(--dg-color-warning-text)",
    };
  }

  return {
    iconBg: "var(--dg-color-info-bg)",
    iconColor: "var(--dg-color-info)",
  };
}

function MetricIcon({ label, color }: { label: string; color: string }) {
  const key = label.toLowerCase();

  if (key.includes("coverage")) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 2.5l5 2v4.3c0 3.3-2.1 5.6-5 6.7-2.9-1.1-5-3.4-5-6.7V4.5l5-2Z" />
        <path d="m6.4 8.9 1.7 1.7 3.6-3.8" />
      </svg>
    );
  }

  if (key.includes("gap")) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="6.25" />
        <path d="M9 5.8v3.6" />
        <path d="M9 12.3h.01" />
      </svg>
    );
  }

  if (key.includes("approval")) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.2 3.2h7.6a1.6 1.6 0 0 1 1.6 1.6v8.4a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6V4.8a1.6 1.6 0 0 1 1.6-1.6Z" />
        <path d="m6.4 9 1.6 1.6 3.7-3.8" />
      </svg>
    );
  }

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
        background: "var(--dg-color-surface)",
        border: "1px solid var(--dg-color-border)",
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
              fontSize: "var(--dg-type-page-title-size)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            {headline}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--dg-color-text-muted)",
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
          className="dg-btn dg-btn-primary"
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
      data-stat-card
      style={{
        background: "var(--dg-color-bg)",
        border: "1px solid var(--dg-color-border)",
        borderRadius: "var(--dg-radius-lg)",
        padding: "12px 14px",
        // The Link wrapper below is the grid child and absorbs the row stretch,
        // so without this a tile carrying no detail line renders short.
        height: "100%",
        boxSizing: "border-box",
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
            fontSize: "var(--dg-type-metadata-size)",
            fontWeight: 500,
            color: "var(--dg-type-metadata-color)",
          }}
        >
          {metric.label}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--dg-radius-lg)",
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
        className="dg-tabular-nums"
        style={{
          fontSize: "clamp(1.45rem, 1.8vw, 1.85rem)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
          letterSpacing: "-0.04em",
        }}
      >
        {metric.value}
      </div>
      {metric.detail ? (
        <div
          style={{
            marginTop: 4,
            fontSize: "var(--dg-type-metadata-size)",
            fontWeight: "var(--dg-type-metadata-weight)",
            color: "var(--dg-type-metadata-color)",
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
      style={{ display: "block", height: "100%", textDecoration: "none", color: "inherit" }}
      aria-label={`${metric.label}: ${metric.value}`}
    >
      {card}
    </Link>
  );
}
