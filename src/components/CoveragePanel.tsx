"use client";

import { useState, useMemo } from "react";
import type { CoverageGap, FocusArea, ShiftCategory } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";

interface CoveragePanelProps {
  gaps: CoverageGap[];
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  activeFocusArea: number | null;
  onClose: () => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function CoveragePanel({
  gaps,
  focusAreas,
  shiftCategories,
  activeFocusArea,
  onClose,
}: CoveragePanelProps) {
  const isMobile = useMediaQuery(MOBILE);
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

  const panelWidth = isMobile ? "100vw" : 380;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: panelWidth,
        height: "100vh",
        background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        zIndex: 100,
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
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
            Coverage Overview
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
            {gaps.length === 0
              ? "All requirements met"
              : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""} found`}
          </div>
        </div>
        <button
          onClick={onClose}
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

      {/* Filters */}
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
          fontSize={12}
          style={{ flex: 1 }}
        />
        <CustomSelect
          value={filterCategory === "all" ? "all" : String(filterCategory)}
          options={[
            { value: "all", label: "All Categories" },
            ...shiftCategories.map((cat) => ({ value: String(cat.id), label: cat.name })),
          ]}
          onChange={(val) => setFilterCategory(val === "all" ? "all" : Number(val))}
          fontSize={12}
          style={{ flex: 1 }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
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
                background: "#F0FDF4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>All coverage requirements met</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {gaps.length === 0
                ? "No gaps detected in the current schedule."
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
                    borderRadius: 6,
                    background: fa?.colorBg ?? "#F1F5F9",
                    color: fa?.colorText ?? "#475569",
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {fa?.name ?? `Area #${focusAreaId}`}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {faGaps.map((gap, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
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
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                          {gap.shiftCategoryName} / {gap.shiftCodeLabel}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                          {formatDate(gap.date)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginTop: 4 }}>
                        {gap.status.actual}/{gap.status.required} staff
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
