/* ── Dashboard mockup ─────────────────────────────────────────────────
   Mirrors the real DubGrid dashboard (apps/web/src/app/dashboard): sticky
   period header, four KPI stat cards, and the Coverage-by-section + Recent
   activity cards. Uses the real .dg-card chrome; Calm Haven seed values. ── */

import { ChevronLeft, ChevronRight, Check, ArrowLeftRight } from "lucide-react";

/* ── KPI stat cards — labels/dots match DashboardStats ── */
const STATS = [
  {
    label: "Total shifts",
    dot: "var(--color-success)",
    bar: "var(--color-success)",
    value: "142",
    pct: 78,
    sub: "vs 138 last week",
    delta: "↑ 4",
    tone: "good" as const,
  },
  {
    label: "Coverage",
    dot: "var(--color-info)",
    bar: "var(--color-info)",
    value: "96%",
    pct: 96,
    sub: "3 open slots",
    delta: "↑ 2%",
    tone: "good" as const,
  },
  {
    label: "Staff scheduled",
    dot: "var(--color-text-subtle)",
    bar: "var(--color-text-subtle)",
    value: "18",
    pct: 86,
    sub: "of 21 active",
    delta: "-",
    tone: "neutral" as const,
  },
  {
    label: "OT alerts",
    dot: "var(--color-danger)",
    bar: "var(--color-danger)",
    value: "2",
    valueColor: "var(--color-danger)",
    pct: 20,
    sub: "over 40h limit",
    delta: "↓ 1",
    tone: "good" as const,
  },
];

const DELTA_TONE = {
  good: { bg: "var(--color-success-bg)", color: "var(--color-success)" },
  bad: { bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  neutral: { bg: "var(--color-bg-secondary)", color: "var(--color-text-subtle)" },
};

/* ── Coverage by section — Calm Haven focus areas ── */
const COVERAGE = [
  { name: "Skilled Nursing", filled: 6, req: 6, pct: 100 },
  { name: "Sheltered Care", filled: 11, req: 12, pct: 92 },
  { name: "Night Shift", filled: 7, req: 8, pct: 88 },
  { name: "Visiting CSNS", filled: 4, req: 4, pct: 100 },
];

function coverageColor(pct: number) {
  if (pct >= 90) return "var(--color-success)";
  if (pct >= 70) return "var(--color-warning)";
  return "var(--color-danger)";
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
  success: { bg: "var(--color-success-bg)", stroke: "var(--color-success-text)" },
  neutral: { bg: "var(--color-bg-secondary)", stroke: "var(--color-text-secondary)" },
};

const monoFont =
  "var(--font-dm-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

export default function DashboardMockup() {
  return (
    <div
      style={{
        background: "var(--color-bg)",
        borderRadius: 14,
        border: "1px solid var(--color-border)",
        padding: "16px 18px 20px",
        maxWidth: 900,
        margin: "0 auto",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Period header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingBottom: 14,
          marginBottom: 16,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[ChevronLeft, ChevronRight].map((Icon, i) => (
            <div
              key={i}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-muted)",
              }}
            >
              <Icon size={14} />
            </div>
          ))}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              minWidth: 132,
              textAlign: "center",
            }}
          >
            May 13 – 19, 2026
          </span>
          <span
            style={{
              height: 30,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            This week
          </span>
        </div>
        <div
          style={{
            display: "flex",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--color-surface)",
          }}
        >
          {["Day", "Week", "2 Weeks"].map((tab, i) => (
            <span
              key={tab}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: i === 1 ? "var(--color-text-primary)" : "var(--color-text-muted)",
                background: i === 1 ? "var(--color-bg-secondary)" : "transparent",
                borderLeft: i > 0 ? "1px solid var(--color-border)" : undefined,
              }}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12 }}>
        {STATS.map((stat) => (
          <div
            className="dg-card"
            key={stat.label}
            style={{
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-text-subtle)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: stat.dot,
                }}
              />
              {stat.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                fontFamily: monoFont,
                color: stat.valueColor ?? "var(--color-text-primary)",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "var(--color-border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${stat.pct}%`,
                  height: "100%",
                  background: stat.bar,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                {stat.sub}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: DELTA_TONE[stat.tone].bg,
                  color: DELTA_TONE[stat.tone].color,
                }}
              >
                {stat.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Coverage + Activity ── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: 12, marginTop: 12 }}
      >
        {/* Coverage by section */}
        <div className="dg-card">
          <div className="dg-card-header">
            <div>
              <div className="dg-card-title">Coverage by focus area</div>
              <div className="dg-card-subtitle">
                This week &middot; required vs scheduled
              </div>
            </div>
          </div>
          <div
            className="dg-card-body"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {COVERAGE.map((row) => (
              <div
                key={row.name}
                style={{
                  padding: "12px 14px",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {row.name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{ fontSize: 11, color: "var(--color-text-subtle)" }}
                    >
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
                    background: "var(--color-border-light)",
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

        {/* Recent activity */}
        <div className="dg-card">
          <div className="dg-card-header">
            <div>
              <div className="dg-card-title">Recent activity</div>
              <div className="dg-card-subtitle">Latest events</div>
            </div>
          </div>
          <div className="dg-card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
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
                        ? "1px solid var(--color-border-light)"
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
                    <item.Icon size={15} color={tone.stroke} strokeWidth={2.4} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.35,
                      }}
                    >
                      {item.text}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-subtle)",
                        marginTop: 3,
                        textTransform: "uppercase",
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
