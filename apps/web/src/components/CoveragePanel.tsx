"use client";
import { ChevronLeft } from "lucide-react";

import { useState, useMemo } from "react";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import { Button } from "@/components/Button";
import type { CoverageGap, FocusArea, ShiftCategory } from "@/types";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { useMediaQuery, MOBILE } from "@/hooks";

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
    .map(
      (detail) => `${detail.assignmentFullName ?? detail.assignmentLabel} short ${detail.shortage}`,
    )
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

  const subtitle = isUnpublished
    ? "Not published yet"
    : gaps.length === 0
      ? isPartial
        ? "No gaps on published dates"
        : "All requirements met"
      : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""}${isPartial ? " on published dates" : " found"}`;

  return (
    <>
      <div className="dg-panel-overlay" onClick={onClose} />
      <div
        className="dg-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Coverage overview"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--dg-color-surface)",
          }}
        >
          {isMobile && (
            <Button
              onClick={onClose}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: "var(--dg-radius-md)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} color="var(--dg-color-text-primary)" />
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Coverage Overview
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          </div>
          {!isMobile && (
            <CloseButton size="md" onClick={onClose} aria-label="Close coverage panel" />
          )}
        </div>

        {!isUnpublished && (
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid var(--dg-color-border)",
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
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "16px" : "20px 24px",
          }}
        >
          {isUnpublished ? (
            <EmptyState
              size="compact"
              style={{ minHeight: 260 }}
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
                    background: "var(--dg-color-bg)",
                    border: "1px dashed var(--dg-color-border)",
                    fontSize: "var(--dg-type-metadata-size)",
                    color: "var(--dg-color-text-subtle)",
                  }}
                >
                  Showing published dates only.
                </div>
              )}
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "var(--dg-color-success-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--dg-color-success-text)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                          borderRadius: "var(--dg-radius-md)",
                          background: "var(--dg-color-bg-secondary)",
                          color: "var(--dg-color-text-muted)",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        {fa?.name ?? `Area #${focusAreaId}`}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {faGaps.map((gap, gapIndex) => (
                          <div
                            key={`${focusAreaId}-${gap.date.toISOString()}-${gap.shiftCategoryId}-${gap.assignmentId}-${gapIndex}`}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "var(--dg-radius-lg)",
                              border: "1px solid var(--dg-color-border)",
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
                              <span
                                style={{
                                  fontSize: "var(--dg-fs-caption)",
                                  fontWeight: 600,
                                  color: "var(--dg-color-text-secondary)",
                                }}
                              >
                                {gap.shiftCategoryName}
                              </span>
                              <span
                                style={{
                                  fontSize: "var(--dg-fs-footnote)",
                                  color: "var(--dg-color-text-muted)",
                                }}
                              >
                                {formatDate(gap.date)}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 700,
                                color: "var(--dg-color-danger-dark)",
                                marginTop: 4,
                              }}
                            >
                              {gap.status.actual}/{gap.status.required} staff
                            </div>
                            {gap.shortageDetails.length > 0 && (
                              <div
                                style={{
                                  fontSize: "var(--dg-fs-footnote)",
                                  color: "var(--dg-color-text-muted)",
                                  marginTop: 4,
                                }}
                              >
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
        <ScrollOverflowCue />
      </div>
    </>
  );
}
