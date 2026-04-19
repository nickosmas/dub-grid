"use client";

import { useState, useMemo } from "react";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import type { CoverageGap, FocusArea, ShiftCategory } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";
import { ExplainerSection, PreviewFrame } from "@/components/ui/explainer-section";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";

interface CoveragePanelProps {
  gaps: CoverageGap[];
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  activeFocusArea: number | null;
  publishedWindowState?: PublishedWindowState;
  onClose: () => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortageDetails(gap: CoverageGap): string {
  return gap.shortageDetails
    .map((detail) => `${detail.shiftCodeLabel} short ${detail.shortage}`)
    .join(", ");
}

export default function CoveragePanel({
  gaps,
  focusAreas,
  shiftCategories,
  activeFocusArea,
  publishedWindowState = "published",
  onClose,
}: CoveragePanelProps) {
  const isMobile = useMediaQuery(MOBILE);
  const isUnpublished = publishedWindowState === "unpublished";
  const isPartial = publishedWindowState === "partial";
  const [filterFocusArea, setFilterFocusArea] = useState<number | "all">(activeFocusArea ?? "all");
  const [prevActiveFocusArea, setPrevActiveFocusArea] = useState(activeFocusArea);
  if (activeFocusArea !== prevActiveFocusArea) {
    setPrevActiveFocusArea(activeFocusArea);
    setFilterFocusArea(activeFocusArea ?? "all");
  }
  const [filterCategory, setFilterCategory] = useState<number | "all">("all");

  const filtered = useMemo(() => {
    return gaps.filter((g) => {
      if (filterFocusArea !== "all" && g.focusAreaId !== filterFocusArea) return false;
      if (filterCategory !== "all" && g.shiftCategoryId !== filterCategory) return false;
      return true;
    });
  }, [gaps, filterFocusArea, filterCategory]);
  const explainerCategoryName = filterCategory === "all"
    ? shiftCategories[0]?.name ?? "Day"
    : shiftCategories.find((category) => category.id === filterCategory)?.name ?? "Day";
  const explainerPoints = [
    {
      title: "Coverage is checked by category total",
      description: `For each focus area, date, and ${explainerCategoryName} category, DubGrid compares the total required headcount to the unique staff scheduled anywhere in that category.`,
    },
    {
      title: "Green means the category total is met",
      description: "If scheduled staff is equal to or greater than the category total required, coverage is considered met.",
    },
    {
      title: "Red shows the missing mix",
      description: "If the category total is short, shortage details call out which shift lines are still light.",
    },
  ];

  // Group by focus area
  const grouped = useMemo(() => {
    const map = new Map<number, CoverageGap[]>();
    for (const g of filtered) {
      const arr = map.get(g.focusAreaId) ?? [];
      arr.push(g);
      map.set(g.focusAreaId, arr);
    }
    return map;
  }, [filtered]);

  const panelWidth = isMobile ? "100vw" : 380;

  return (
    <>
    <div className="dg-panel-overlay" onClick={onClose} />
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: panelWidth,
        height: "100vh",
        background: "var(--color-surface)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        zIndex: 10001,
        display: "flex",
        flexDirection: "column",
        animation: "slideInRight 0.2s ease-out",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Coverage Overview
          </div>
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 2 }}>
            {isUnpublished
              ? "Not published yet"
              : gaps.length === 0
                ? isPartial
                  ? "No gaps on published dates"
                  : "All requirements met"
                : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""}${isPartial ? " on published dates" : " found"}`}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close coverage panel"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            borderRadius: 8,
            color: "var(--color-text-muted)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {!isUnpublished && (
        <div
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <CustomSelect
            value={filterFocusArea === "all" ? "all" : String(filterFocusArea)}
            options={[
              { value: "all", label: "All Focus Areas" },
              ...focusAreas.map((fa) => ({ value: String(fa.id), label: fa.name })),
            ]}
            onChange={(val) => setFilterFocusArea(val === "all" ? "all" : Number(val))}
            fontSize="var(--dg-fs-caption)"
            style={{ flex: 1 }}
          />
          <CustomSelect
            value={filterCategory === "all" ? "all" : String(filterCategory)}
            options={[
              { value: "all", label: "All Categories" },
              ...shiftCategories.map((cat) => ({ value: String(cat.id), label: cat.name })),
            ]}
            onChange={(val) => setFilterCategory(val === "all" ? "all" : Number(val))}
            fontSize="var(--dg-fs-caption)"
            style={{ flex: 1 }}
          />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
        {isUnpublished ? (
          <DashboardEmptyState
            variant="panel"
            minHeight={260}
            title="Not published yet"
            description="Coverage details will appear after this period is published for the first time."
          />
        ) : (
          <>
            {isPartial && (
              <div
                style={{
                  marginBottom: 12,
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
            <div style={{ marginBottom: 12 }}>
              <ExplainerSection
                title="How coverage is scored"
                points={explainerPoints}
                compact
                defaultOpen={false}
                storageKey="dg-explainer-coverage-panel"
                preview={(
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <PreviewFrame
                      title="Green"
                      subtitle={`${explainerCategoryName} category`}
                      compact
                      badge={(
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background: "rgba(16, 185, 129, 0.08)",
                            color: "var(--color-success-text)",
                            border: "1px solid var(--color-success-border)",
                          }}
                        >
                          Covered
                        </span>
                      )}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--dg-radius-sm)",
                          background: "var(--color-bg)",
                          border: "1px solid var(--color-border-light)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Required</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>4 staff</span>
                      </div>
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--dg-radius-sm)",
                          background: "rgba(16, 185, 129, 0.08)",
                          border: "1px solid var(--color-success-border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Scheduled</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-success-text)" }}>5 staff</span>
                      </div>
                    </PreviewFrame>

                    <PreviewFrame
                      title="Red"
                      subtitle={`${explainerCategoryName} category`}
                      compact
                      badge={(
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            background: "rgba(220, 38, 38, 0.06)",
                            color: "var(--color-danger-dark)",
                            border: "1px solid var(--color-danger-border)",
                          }}
                        >
                          Short
                        </span>
                      )}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--dg-radius-sm)",
                          background: "rgba(220, 38, 38, 0.06)",
                          border: "1px solid var(--color-danger-border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Required</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>4 staff</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Scheduled</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-danger-dark)" }}>3 staff</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-danger-dark)", lineHeight: 1.4 }}>
                          Shortage detail explains which shift lines are still missing.
                        </div>
                      </div>
                    </PreviewFrame>
                  </div>
                )}
              />
            </div>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--color-success-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-success-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div style={{ fontSize: "var(--dg-fs-body-sm)", fontWeight: 600 }}>
                  {isPartial ? "No gaps on published dates" : "All coverage requirements met"}
                </div>
                <div style={{ fontSize: "var(--dg-fs-caption)", marginTop: 4 }}>
                  {gaps.length === 0
                    ? isPartial
                      ? "Coverage is only shown for dates that have been published."
                      : "No gaps detected in the current schedule."
                    : "No gaps match the current filters."}
                </div>
              </div>
            ) : (
              Array.from(grouped.entries()).map(([focusAreaId, faGaps]) => {
                const fa = focusAreas.find((f) => f.id === focusAreaId);
                return (
                  <div key={focusAreaId} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: 8,
                        background: "var(--color-bg-secondary)",
                        color: "var(--color-text-muted)",
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      {fa?.name ?? `Area #${focusAreaId}`}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {faGaps.map((gap) => (
                        <div
                          key={`${focusAreaId}-${gap.date.toISOString()}-${gap.shiftCategoryId}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "var(--dg-radius-lg)",
                            border: "1px solid var(--color-border)",
                            background: "rgba(220, 38, 38, 0.03)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                              {gap.shiftCategoryName}
                            </span>
                            <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
                              {formatDate(gap.date)}
                            </span>
                          </div>
                          <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-danger-dark)", marginTop: 4 }}>
                            {gap.status.actual}/{gap.status.required} staff
                          </div>
                          {gap.shortageDetails.length > 0 && (
                            <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", marginTop: 4 }}>
                              {formatShortageDetails(gap)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
    </>
  );
}
