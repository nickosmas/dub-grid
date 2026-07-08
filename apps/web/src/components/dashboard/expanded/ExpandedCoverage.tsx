import React, { useState, useMemo } from "react";
import type { SectionCoverage } from "@/lib/dashboard-stats";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import type { FocusArea } from "@/types";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";

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

interface ExpandedCoverageProps {
  sections: SectionCoverage[];
  focusAreas: FocusArea[];
  focusAreaLabel: string;
  hasRequirements: boolean;
  publishedWindowState?: PublishedWindowState;
  onClose: () => void;
}

export default function ExpandedCoverage({
  sections,
  focusAreas,
  focusAreaLabel,
  hasRequirements,
  publishedWindowState = "published",
  onClose,
}: ExpandedCoverageProps) {
  const [filter, setFilter] = useState<"all" | number>("all");
  const isUnpublished = hasRequirements && publishedWindowState === "unpublished";
  const isPartial = hasRequirements && publishedWindowState === "partial";

  const filtered = useMemo(
    () => (filter === "all" ? sections : sections.filter((s) => s.focusAreaId === filter)),
    [sections, filter],
  );

  // Summary stats
  const totalFilled = sections.reduce((s, sec) => s + sec.filledTotal, 0);
  const totalRequired = sections.reduce((s, sec) => s + sec.requiredTotal, 0);
  const overallPct = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100;

  return (
    <Modal
      title={`Coverage by ${focusAreaLabel.toLowerCase()}`}
      onClose={onClose}
      style={modalStyle}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isUnpublished ? (
          <div style={emptyStyle}>
            This period has not been published yet. Coverage details will appear after the first
            publish.
          </div>
        ) : (
          <>
            {isPartial && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--dg-radius-sm)",
                  background: "var(--color-bg)",
                  border: "1px dashed var(--color-border)",
                  fontSize: 11,
                  color: "var(--color-text-subtle)",
                }}
              >
                Showing published dates only.
              </div>
            )}
            {/* Summary + filter row */}
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                padding: 16,
                borderRadius: "var(--dg-radius-md)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div style={summaryBadgeStyle}>
                <span
                  style={{
                    fontWeight: 700,
                    color:
                      PCT_COLORS[overallPct >= 90 ? "green" : overallPct >= 70 ? "amber" : "red"],
                  }}
                >
                  {overallPct}%
                </span>
                <span style={{ color: "var(--color-text-subtle)" }}>overall</span>
              </div>
              <div style={summaryBadgeStyle}>
                <span style={{ fontWeight: 700 }}>{totalFilled}</span>
                <span style={{ color: "var(--color-text-subtle)" }}>/ {totalRequired} filled</span>
              </div>
              <CustomSelect
                value={filter === "all" ? "all" : String(filter)}
                options={[
                  { value: "all", label: "All sections" },
                  ...focusAreas.map((fa) => ({ value: String(fa.id), label: fa.name })),
                ]}
                onChange={(val) => setFilter(val === "all" ? "all" : Number(val))}
                style={{ marginLeft: "auto" }}
                fontSize="var(--dg-fs-label)"
              />
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {filtered.length === 0 ? (
                <div style={emptyStyle}>
                  {isPartial
                    ? "No coverage data on published dates for this filter"
                    : "No coverage data for this filter"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Coverage bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {filtered.map((sec) => {
                      const pctColor = sec.pct >= 90 ? "green" : sec.pct >= 70 ? "amber" : "red";
                      return (
                        <div
                          key={sec.focusAreaId}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: "14px 16px",
                            borderRadius: "var(--dg-radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-bg)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "baseline",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: "var(--color-text-primary)",
                                }}
                              >
                                {sec.focusAreaName}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
                                {sec.filledTotal} / {sec.requiredTotal} filled
                              </span>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: PCT_COLORS[pctColor],
                                }}
                              >
                                {sec.pct}%
                              </span>
                            </div>
                          </div>
                          <div
                            style={{
                              height: 8,
                              background: "var(--color-border)",
                              borderRadius: 4,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: 8,
                                borderRadius: 4,
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

                  {/* Heatmap */}
                  {filtered.length > 0 && filtered[0].daily.length > 0 && (
                    <div>
                      <div style={heatmapLabelStyle}>Day-by-day staffing</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `100px repeat(${filtered[0].daily.length}, 1fr)`,
                          gap: 4,
                          overflowX: "auto",
                        }}
                      >
                        {/* Header row */}
                        <div />
                        {filtered[0].daily.map((d) => (
                          <div key={d.dateKey} style={heatmapHeaderStyle}>
                            {d.dayLabel}
                          </div>
                        ))}

                        {/* Data rows */}
                        {filtered.map((sec) => (
                          <React.Fragment key={sec.focusAreaId}>
                            <div style={heatmapRowLabelStyle}>{sec.focusAreaName}</div>
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
                                    height: 32,
                                    borderRadius: 5,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: colors.bg,
                                    color: colors.text,
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
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 900, width: "90vw" };

const summaryBadgeStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 5,
  fontSize: 13,
  padding: "8px 12px",
  borderRadius: "var(--dg-radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
};

const heatmapLabelStyle = {
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--color-text-subtle)",
  marginBottom: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const heatmapHeaderStyle = {
  fontSize: 10,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  fontWeight: 500,
  padding: "2px 0",
};

const heatmapRowLabelStyle = {
  fontSize: 11,
  color: "var(--color-text-subtle)",
  textAlign: "right" as const,
  paddingRight: 8,
  lineHeight: "32px",
  whiteSpace: "nowrap" as const,
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
};

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};
