"use client";

import { useMemo } from "react";
import { addDays, formatDate } from "@/lib/utils";
import { Wing } from "@/types";
import { ViewMode } from "@/components/Header";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ToolbarProps {
  viewMode: ViewMode;
  weekStart: Date;
  spanWeeks: 1 | 2 | "month";
  activeWing: string;
  staffSearch: string;
  wings: Wing[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSpanChange: (n: 1 | 2 | "month") => void;
  onWingChange: (wing: string) => void;
  onStaffSearchChange: (q: string) => void;
  canEditSchedule?: boolean;
  isEditMode?: boolean;
  onToggleEditMode?: () => void;
  onApplyRegular?: () => void;
  isApplyingRegular?: boolean;
}

export default function Toolbar({
  viewMode,
  weekStart,
  spanWeeks,
  activeWing,
  staffSearch,
  wings,
  onPrev,
  onNext,
  onToday,
  onSpanChange,
  onWingChange,
  onStaffSearchChange,
  canEditSchedule,
  isEditMode,
  onToggleEditMode,
  onApplyRegular,
  isApplyingRegular,
}: ToolbarProps) {
  const weekLabel = useMemo(() => {
    if (spanWeeks === "month") {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return spanWeeks === 2
      ? `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 13))}`
      : `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`;
  }, [weekStart, spanWeeks]);

  const wingOptions = [{ name: "All" }, ...wings];

  if (viewMode !== "schedule") {
    return <div style={{ marginBottom: 18 }} />;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      {/* ── LEFT ZONE: Contextual controls ── */}

      {/* Week navigation */}
      <div className="dg-segment">
        <button
          className="dg-segment-btn"
          onClick={onPrev}
          style={{ padding: "7px 10px", fontSize: 15, lineHeight: 1 }}
          title="Previous period"
        >
          ‹
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            borderLeft: "1px solid var(--color-border)",
            borderRight: "1px solid var(--color-border)",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
              minWidth: 120,
              textAlign: "center",
            }}
          >
            {weekLabel}
          </span>
        </div>
        <button
          className="dg-segment-btn"
          onClick={onToday}
          style={{ fontSize: 12 }}
        >
          Today
        </button>
        <button
          className="dg-segment-btn"
          onClick={onNext}
          style={{ padding: "7px 10px", fontSize: 15, lineHeight: 1 }}
          title="Next period"
        >
          ›
        </button>
      </div>

      {/* Span toggle: 1W / 2W / M */}
      <div className="dg-segment">
        {([1, 2, "month"] as const).map((n) => (
          <button
            key={n}
            onClick={() => onSpanChange(n)}
            className={`dg-segment-btn${spanWeeks === n ? " active" : ""}`}
          >
            {n === "month" ? "M" : `${n}W`}
          </button>
        ))}
      </div>

      {/* Wing filter */}
      {wingOptions.length > 1 && (
        <div className="dg-segment">
          {wingOptions.map((w) => (
            <button
              key={w.name}
              onClick={() => onWingChange(w.name)}
              className={`dg-segment-btn${activeWing === w.name ? " active" : ""}`}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {/* Staff search */}
      <div style={{ position: "relative" }}>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "var(--color-text-faint)", pointerEvents: "none",
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Find staff…"
          value={staffSearch}
          onChange={(e) => onStaffSearchChange(e.target.value)}
          className="dg-input"
          style={{ paddingLeft: 30, width: 160, borderRadius: 10 }}
        />
        {staffSearch && (
          <button
            onClick={() => onStaffSearchChange("")}
            className="dg-btn-ghost"
            style={{
              position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
              padding: "2px 5px", fontSize: 14, lineHeight: 1, borderRadius: 6,
            }}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* ── RIGHT ZONE: Global actions ── */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>

        {/* Download — disabled while editing to prevent printing draft state */}
        <button
          onClick={() => window.print()}
          disabled={isEditMode}
          className="dg-btn dg-btn-ghost"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "7px 12px",
            opacity: isEditMode ? 0.4 : 1,
            cursor: isEditMode ? "not-allowed" : "pointer",
          }}
          title={isEditMode ? "Exit edit mode to download" : "Print / Download schedule"}
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </button>

        {/* Apply Regular Schedules — shown in edit mode */}
        {canEditSchedule && isEditMode && onApplyRegular && (
          <button
            onClick={onApplyRegular}
            disabled={isApplyingRegular}
            className="dg-btn"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              padding: "7px 12px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: isApplyingRegular ? 0.6 : 1,
            }}
            title="Fill empty slots from employees' regular schedule templates"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
            </svg>
            {isApplyingRegular ? "Applying…" : "Apply Regular"}
          </button>
        )}

        {/* Edit mode toggle — only for schedulers */}
        {canEditSchedule && onToggleEditMode && (
          isEditMode ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#B45309",
                background: "#FEF3C7",
                border: "1px solid #FCD34D",
                borderRadius: 8,
                padding: "5px 10px",
                letterSpacing: "0.02em",
                userSelect: "none",
              }}
            >
              Edit Mode: ON
            </span>
          ) : (
            <button
              onClick={onToggleEditMode}
              className="dg-btn dg-btn-primary"
            >
              Edit
            </button>
          )
        )}
      </div>
    </div>
  );
}
