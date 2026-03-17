"use client";

import { useMemo } from "react";
import { addDays, formatDate } from "@/lib/utils";
import { FocusArea } from "@/types";
import CustomSelect from "@/components/CustomSelect";

const SPAN_OPTIONS = [
  { value: 1 as const, label: "1 Week" },
  { value: 2 as const, label: "2 Weeks" },
  { value: "month" as const, label: "Month" },
];


const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ToolbarProps {
  weekStart: Date;
  spanWeeks: 1 | 2 | "month";
  activeFocusArea: number | null;
  staffSearch: string;
  focusAreas: FocusArea[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSpanChange: (n: 1 | 2 | "month") => void;
  onFocusAreaChange: (id: number | null) => void;
  onStaffSearchChange: (q: string) => void;
  canEditShifts?: boolean;
  onApplyRecurring?: () => void;
  isApplyingRecurring?: boolean;
  onPrintOpen?: () => void;
  presenceSlot?: React.ReactNode;
}

export default function Toolbar({
  weekStart,
  spanWeeks,
  activeFocusArea,
  staffSearch,
  focusAreas,
  onPrev,
  onNext,
  onToday,
  onSpanChange,
  onFocusAreaChange,
  onStaffSearchChange,
  canEditShifts,
  onApplyRecurring,
  isApplyingRecurring,
  onPrintOpen,
  presenceSlot,
}: ToolbarProps) {
  const weekLabel = useMemo(() => {
    if (spanWeeks === "month") {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return spanWeeks === 2
      ? `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 13))}`
      : `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`;
  }, [weekStart, spanWeeks]);

  const focusAreaOptions: { id: number | null; name: string }[] = [
    { id: null, name: "All" },
    ...focusAreas.map((fa) => ({ id: fa.id, name: fa.name })),
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        paddingBottom: 12,
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

      {/* Span selector */}
      <CustomSelect value={spanWeeks} options={SPAN_OPTIONS} onChange={onSpanChange} />

      {/* Focus area filter */}
      {focusAreaOptions.length > 1 && (
        <div className="dg-segment">
          {focusAreaOptions.map((w) => (
            <button
              key={w.id ?? "all"}
              onClick={() => onFocusAreaChange(w.id)}
              className={`dg-segment-btn${activeFocusArea === w.id ? " active" : ""}`}
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

        {presenceSlot}

        {/* Print */}
        <button
          onClick={onPrintOpen}
          disabled={!onPrintOpen}
          className="dg-btn dg-btn-ghost"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "7px 12px",
          }}
          title="Print / Export schedule"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print
        </button>

        {/* Apply Recurring Schedules — shown for editors */}
        {canEditShifts && onApplyRecurring && (
          <button
            onClick={onApplyRecurring}
            disabled={isApplyingRecurring}
            className="dg-btn"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              padding: "7px 12px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: isApplyingRecurring ? 0.6 : 1,
            }}
            title="Fill empty slots from employees' recurring schedule templates"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
            </svg>
            {isApplyingRecurring ? "Filling…" : "Auto Fill Shifts"}
          </button>
        )}
      </div>
    </div>
  );
}
