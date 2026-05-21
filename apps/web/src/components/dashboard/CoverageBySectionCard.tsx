import React from "react";
import type { SectionCoverage } from "@/lib/dashboard-stats";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import ExpandButton from "./ExpandButton";
import { EmptyState } from "@/components/EmptyState";

const STATUS_COLORS = {
  green: { bg: "var(--color-success-border)", text: "var(--color-success-text)" },
  amber: { bg: "var(--color-warning-border)", text: "var(--color-warning-text)" },
  red: { bg: "var(--color-danger-border)", text: "var(--color-danger-text)" },
  none: { bg: "var(--color-bg-secondary)", text: "var(--color-text-subtle)" },
};

const PCT_COLORS = {
  green: "var(--color-success)",
  amber: "var(--color-warning)",
  red: "var(--color-danger)",
};

interface CoverageBySectionCardProps {
  sections: SectionCoverage[];
  focusAreaLabel: string;
  isMobile: boolean;
  hasRequirements: boolean;
  publishedWindowState?: PublishedWindowState;
  periodLabel?: string;
  onExpand?: () => void;
}

export default function CoverageBySectionCard({
  sections,
  focusAreaLabel,
  isMobile,
  hasRequirements,
  publishedWindowState = "published",
  periodLabel = "this week",
  onExpand,
}: CoverageBySectionCardProps) {
  const isUnpublished = hasRequirements && publishedWindowState === "unpublished";
  const isPartial = hasRequirements && publishedWindowState === "partial";
  const subtitle = !hasRequirements
    ? "No coverage requirements configured"
    : isUnpublished
      ? "Not published yet"
      : isPartial
        ? "Published dates only · required vs scheduled"
        : `${periodLabel} · required vs scheduled`;

  if (sections.length === 0) {
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Coverage by {focusAreaLabel.toLowerCase()}</div>
            <div className="dg-card-subtitle">{subtitle}</div>
          </div>
        </div>
        <div className="dg-card-body">
          <EmptyState
            size="inline"
            title={
              !hasRequirements
                ? undefined
                : isUnpublished
                  ? "Not published yet"
                  : isPartial
                    ? "All published dates covered"
                    : "All coverage requirements met this week"
            }
            description={
              !hasRequirements
                ? `Set up coverage requirements in Settings to track how well each ${focusAreaLabel.toLowerCase()} is staffed.`
                : isUnpublished
                  ? "Coverage details will appear after this period is published."
                  : isPartial
                    ? "Coverage is only shown for dates that have been published."
                    : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dg-card">
      {/* Header */}
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Coverage by {focusAreaLabel.toLowerCase()}</div>
          <div className="dg-card-subtitle">{subtitle}</div>
        </div>
        {onExpand && <ExpandButton onClick={onExpand} label="Expand coverage" />}
      </div>

      <div className="dg-card-body">
        {/* Coverage bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sections.map((sec) => {
            const pctColor = sec.pct >= 90 ? "green" : sec.pct >= 70 ? "amber" : "red";
            return (
              <div
                key={sec.focusAreaId}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  padding: "14px 16px",
                  borderRadius: "var(--dg-radius-md)",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                    {sec.focusAreaName}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                      {sec.filledTotal} / {sec.requiredTotal} filled
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PCT_COLORS[pctColor] }}>
                      {sec.pct}%
                    </span>
                  </div>
                </div>
                <div style={{ height: 6, background: "var(--color-border)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: `${Math.min(100, sec.pct)}%`,
                      background: PCT_COLORS[pctColor],
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Day-by-day heatmap */}
        {sections.length > 0 && sections[0].daily.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-subtle)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Day-by-day staffing
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `80px repeat(${sections[0].daily.length}, 1fr)`,
                gap: 4,
                overflowX: isMobile ? "auto" : undefined,
              }}
            >
              {/* Header row */}
              <div />
              {sections[0].daily.map((d) => (
                <div
                  key={d.dateKey}
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-subtle)",
                    textAlign: "center",
                    fontWeight: 500,
                    padding: "2px 0",
                  }}
                >
                  {d.dayLabel}
                </div>
              ))}

              {/* Data rows */}
              {sections.map((sec) => (
                <React.Fragment key={sec.focusAreaId}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-subtle)",
                      textAlign: "right",
                      paddingRight: 8,
                      lineHeight: "28px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {sec.focusAreaName}
                  </div>
                  {sec.daily.map((day) => {
                    const colors = STATUS_COLORS[day.status];
                    const hasRequirement = day.requiredCount > 0;
                    const cellLabel = hasRequirement
                      ? `${day.filledCount}/${day.requiredCount}`
                      : "\u2014";
                    const ariaLabel = hasRequirement
                      ? `${sec.focusAreaName} ${day.dayLabel}: ${day.filledCount} of ${day.requiredCount} required slots filled`
                      : `${sec.focusAreaName} ${day.dayLabel}: no coverage requirement`;

                    return (
                      <div
                        key={`${sec.focusAreaId}-${day.dateKey}`}
                        style={{
                          height: 28,
                          borderRadius: 5,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 600,
                        background: colors.bg,
                        color: colors.text,
                        cursor: "default",
                      }}
                        aria-label={ariaLabel}
                      >
                        {cellLabel}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
