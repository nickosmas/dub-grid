/* ── Dashboard mockup ─────────────────────────────────────────────────
   Mirrors the AdminDashboard layout (apps/web/src/components/dashboard):
   period header, DashboardHero card (title + action + metric cards),
   then a two-column row with CoverageBySectionCard and ActivityFeed.
   Calm Haven seed values throughout. ── */

import { ChevronLeft, ChevronRight, Check, ArrowLeftRight } from "lucide-react";

/* ── Hero metric cards — match the four labels in DashboardView.tsx ── */
type Metric = {
  label: string;
  value: string;
  detail: string;
  /** Top-right icon variant — controls accent color & glyph. */
  icon: "coverage" | "gap" | "approval" | "bars";
};

const HERO_METRICS: Metric[] = [
  {
    label: "Coverage",
    value: "96%",
    detail: "Current staffing coverage",
    icon: "coverage",
  },
  {
    label: "Open gaps",
    value: "3",
    detail: "Staffing gaps this period",
    icon: "gap",
  },
  {
    label: "Draft shifts",
    value: "5",
    detail: "Unpublished schedule changes",
    icon: "bars",
  },
  {
    label: "Pending approvals",
    value: "2",
    detail: "Requests waiting for review",
    icon: "approval",
  },
];

/* ── Metric icon accents — match DashboardHero.tsx getMetricAccent.
   Token-driven (not the raw pastel hex the real component used to hardcode)
   so these follow the page theme instead of blowing out in dark mode. ── */
const METRIC_ACCENTS: Record<Metric["icon"], { iconBg: string; iconColor: string }> = {
  coverage: { iconBg: "var(--dg-color-brand-bg)", iconColor: "var(--dg-color-brand)" },
  gap: { iconBg: "var(--dg-color-danger-bg)", iconColor: "var(--dg-color-danger-text)" },
  approval: { iconBg: "var(--dg-color-warning-bg)", iconColor: "var(--dg-color-warning-text)" },
  bars: { iconBg: "var(--dg-color-info-bg)", iconColor: "var(--dg-color-info)" },
};

function MetricGlyph({ icon, color }: { icon: Metric["icon"]; color: string }) {
  if (icon === "coverage") {
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
  if (icon === "gap") {
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
  if (icon === "approval") {
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

/* ── Coverage rows — Calm Haven focus areas ── */
const COVERAGE = [
  { name: "Skilled Nursing", filled: 6, req: 6, pct: 100 },
  { name: "Sheltered Care", filled: 11, req: 12, pct: 92 },
  { name: "Night Shift", filled: 7, req: 8, pct: 88 },
  { name: "Visiting CSNS", filled: 4, req: 4, pct: 100 },
];

function coverageColor(pct: number) {
  if (pct >= 90) return "var(--dg-color-success)";
  if (pct >= 70) return "var(--dg-color-warning)";
  return "var(--dg-color-danger)";
}

const ACTIVITY = [
  {
    Icon: Check,
    tone: "success" as const,
    text: "Carol Henderson published the week of May 12",
    time: "2 HOURS AGO",
  },
  {
    Icon: ArrowLeftRight,
    tone: "neutral" as const,
    text: "Kevin Donovan requested a shift pickup",
    time: "5 HOURS AGO",
  },
  {
    Icon: Check,
    tone: "success" as const,
    text: "Evelyn Hartwell approved a swap request",
    time: "1 DAY AGO",
  },
];

const ACTIVITY_TONE = {
  success: { bg: "var(--dg-color-success-bg)", stroke: "var(--dg-color-success-text)" },
  neutral: { bg: "var(--dg-color-bg-secondary)", stroke: "var(--dg-color-text-secondary)" },
};

export default function DashboardMockup() {
  return (
    <div
      style={{
        background: "var(--dg-color-bg)",
        borderRadius: 14,
        border: "1px solid var(--dg-color-border)",
        padding: "20px 24px 24px",
        maxWidth: 960,
        margin: "0 auto",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── Period header (matches DashboardHeader desktop layout) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[ChevronLeft, ChevronRight].map((Icon, i) => (
            <div
              key={i}
              style={{
                width: 38,
                height: 38,
                borderRadius: 6,
                border: "1px solid var(--dg-color-border)",
                background: "var(--dg-color-surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--dg-color-text-secondary)",
              }}
            >
              <Icon size={14} strokeWidth={2.5} />
            </div>
          ))}
          <div
            style={{
              textAlign: "center" as const,
              minWidth: 120,
              padding: "0 8px",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--dg-color-text-secondary)",
                whiteSpace: "nowrap" as const,
              }}
            >
              May 13 &ndash; 19, 2026
            </span>
          </div>
          <div
            style={{
              height: 38,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              borderRadius: 6,
              border: "1px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            This week
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Day / Week / 2 Weeks segmented control */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--dg-color-border)",
            borderRadius: 6,
            overflow: "hidden",
            background: "var(--dg-color-surface)",
          }}
        >
          {["Day", "Week", "2 Weeks"].map((tab, i) => (
            <span
              key={tab}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: i === 1 ? "var(--dg-color-text-primary)" : "var(--dg-color-text-muted)",
                background: i === 1 ? "var(--dg-color-bg-secondary)" : "transparent",
                borderLeft: i > 0 ? "1px solid var(--dg-color-border)" : undefined,
              }}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      {/* ── DashboardHero — title + action + metric cards ── */}
      <div
        style={{
          background: "var(--dg-color-surface)",
          border: "1px solid var(--dg-color-border)",
          borderRadius: 12,
          padding: "16px 18px",
          display: "grid",
          gap: 14,
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
            <h3
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
                letterSpacing: "-0.03em",
                lineHeight: 1.2,
              }}
            >
              Where the week stands
            </h3>
            <p
              style={{
                margin: "6px 0 0",
                color: "var(--dg-color-text-muted)",
                fontSize: 14,
                maxWidth: 520,
                lineHeight: 1.45,
              }}
            >
              Coverage, gaps, and unpublished changes across the schedule. Jump straight to whatever
              needs your attention.
            </p>
          </div>
          {/* Action button — matches dg-btn-brand (filled brand, white text) */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 38,
              padding: "0 16px",
              borderRadius: 6,
              background: "var(--dg-color-brand)",
              color: "var(--dg-color-text-inverse)",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap" as const,
            }}
          >
            View schedule
          </div>
        </div>

        {/* Metric cards — match DashboardHero MetricCard layout */}
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          {HERO_METRICS.map((metric) => {
            const accent = METRIC_ACCENTS[metric.icon];
            return (
              <div
                key={metric.label}
                style={{
                  background: "var(--dg-color-bg)",
                  border: "1px solid var(--dg-color-border)",
                  borderRadius: 10,
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
                      fontSize: 11,
                      color: "var(--dg-color-text-muted)",
                      minWidth: 0,
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
                    <MetricGlyph icon={metric.icon} color={accent.iconColor} />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "var(--dg-color-text-primary)",
                    letterSpacing: "-0.04em",
                    lineHeight: 1.05,
                  }}
                >
                  {metric.value}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: "var(--dg-color-text-muted)",
                    lineHeight: 1.4,
                  }}
                >
                  {metric.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Coverage + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
        {/* Coverage by focus area card — matches CoverageBySectionCard */}
        <div
          style={{
            background: "var(--dg-color-surface)",
            border: "1px solid var(--dg-color-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--dg-color-border-light)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Coverage by focus area
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--dg-color-text-subtle)",
                marginTop: 1,
              }}
            >
              This week &middot; required vs scheduled
            </div>
          </div>
          <div
            style={{
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {COVERAGE.map((row) => (
              <div
                key={row.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  padding: "14px 16px",
                  borderRadius: 8,
                  background: "var(--dg-color-bg)",
                  border: "1px solid var(--dg-color-border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--dg-color-text-secondary)",
                    }}
                  >
                    {row.name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--dg-color-text-subtle)" }}>
                      {row.filled} / {row.req} filled
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: coverageColor(row.pct),
                      }}
                    >
                      {row.pct}%
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "var(--dg-color-border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${row.pct}%`,
                      height: "100%",
                      background: coverageColor(row.pct),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity — matches ActivityFeed */}
        <div
          style={{
            background: "var(--dg-color-surface)",
            border: "1px solid var(--dg-color-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--dg-color-border-light)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Recent activity
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--dg-color-text-subtle)",
                marginTop: 1,
              }}
            >
              Latest events
            </div>
          </div>
          <div style={{ padding: "12px 16px 16px" }}>
            {ACTIVITY.map((item, i) => {
              const tone = ACTIVITY_TONE[item.tone];
              return (
                <div
                  key={item.text}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom:
                      i < ACTIVITY.length - 1
                        ? "1px solid var(--dg-color-border-light)"
                        : undefined,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: tone.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <item.Icon size={14} color={tone.stroke} strokeWidth={1.6} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--dg-color-text-secondary)",
                        lineHeight: 1.35,
                      }}
                    >
                      {item.text}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--dg-color-text-subtle)",
                        marginTop: 3,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {item.time}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
