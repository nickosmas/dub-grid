"use client";

import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  onImportPrevious?: () => void;
  isImportingPrevious?: boolean;
  onPrintOpen?: () => void;
  presenceSlot?: React.ReactNode;
  showAudit?: boolean;
  onAuditToggle?: () => void;
}

/* ── Toggle Switch ── */
function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: on ? "#16A34A" : "#CBD5E1",
        position: "relative",
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          transition: "left 0.15s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

/* ── Tools Dropdown Menu ── */
function ToolsMenu({
  triggerRef,
  onClose,
  showAudit,
  onAuditToggle,
  onPrintOpen,
  canEditShifts,
  onApplyRecurring,
  isApplyingRecurring,
  onImportPrevious,
  isImportingPrevious,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  showAudit?: boolean;
  onAuditToggle?: () => void;
  onPrintOpen?: () => void;
  canEditShifts?: boolean;
  onApplyRecurring?: () => void;
  isApplyingRecurring?: boolean;
  onImportPrevious?: () => void;
  isImportingPrevious?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: rect.right,
    });
  }, [triggerRef]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, triggerRef]);

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text)",
    cursor: "pointer",
    borderRadius: 7,
    border: "none",
    background: "none",
    width: "100%",
    textAlign: "left",
    lineHeight: 1,
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translateX(-100%)",
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
        padding: 4,
        zIndex: 9999,
        minWidth: 200,
      }}
    >
      {/* Authors toggle */}
      {onAuditToggle && (
        <button
          style={itemStyle}
          onClick={onAuditToggle}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-overlay)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span style={{ flex: 1 }}>Authors</span>
          <ToggleSwitch on={!!showAudit} />
        </button>
      )}

      {/* Print */}
      {onPrintOpen && (
        <button
          style={itemStyle}
          onClick={() => { onPrintOpen(); onClose(); }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-overlay)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print
        </button>
      )}

      {/* Auto Fill Shifts */}
      {canEditShifts && onApplyRecurring && (
        <button
          style={{
            ...itemStyle,
            opacity: isApplyingRecurring ? 0.6 : 1,
          }}
          disabled={isApplyingRecurring}
          onClick={() => { onApplyRecurring(); onClose(); }}
          onMouseEnter={(e) => { if (!isApplyingRecurring) e.currentTarget.style.background = "var(--color-surface-overlay)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
          </svg>
          {isApplyingRecurring ? "Filling..." : "Auto Fill Shifts"}
        </button>
      )}

      {/* Import Previous Schedule */}
      {canEditShifts && onImportPrevious && (
        <button
          style={{
            ...itemStyle,
            opacity: isImportingPrevious ? 0.6 : 1,
          }}
          disabled={isImportingPrevious}
          onClick={() => { onImportPrevious(); onClose(); }}
          onMouseEnter={(e) => { if (!isImportingPrevious) e.currentTarget.style.background = "var(--color-surface-overlay)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          {isImportingPrevious ? "Importing..." : "Import Previous Schedule"}
        </button>
      )}
    </div>,
    document.body,
  );
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
  onImportPrevious,
  isImportingPrevious,
  onPrintOpen,
  presenceSlot,
  showAudit,
  onAuditToggle,
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

  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const toggleTools = useCallback(() => setToolsOpen((p) => !p), []);
  const closeTools = useCallback(() => setToolsOpen(false), []);

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

        {/* Tools dropdown */}
        <button
          ref={toolsBtnRef}
          onClick={toggleTools}
          className="dg-btn dg-btn-ghost"
          style={{
            border: toolsOpen ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "7px 12px",
            background: toolsOpen ? "var(--color-primary-light)" : undefined,
            color: toolsOpen ? "var(--color-primary)" : undefined,
          }}
          title="Tools"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          Tools
        </button>

        {toolsOpen && (
          <ToolsMenu
            triggerRef={toolsBtnRef}
            onClose={closeTools}
            showAudit={showAudit}
            onAuditToggle={onAuditToggle}
            onPrintOpen={onPrintOpen}
            canEditShifts={canEditShifts}
            onApplyRecurring={onApplyRecurring}
            isApplyingRecurring={isApplyingRecurring}
            onImportPrevious={onImportPrevious}
            isImportingPrevious={isImportingPrevious}
          />
        )}
      </div>
    </div>
  );
}
