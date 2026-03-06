"use client";

import { useMemo, useState, useRef, useEffect } from "react";
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
}: ToolbarProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    function handleOutside(e: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [toolsOpen]);

  const weekLabel = useMemo(() => {
    if (spanWeeks === "month") {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return spanWeeks === 2
      ? `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 13))}`
      : `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`;
  }, [weekStart, spanWeeks]);

  const wingOptions = [{ name: "All" }, ...wings];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
      }}
    >
      {viewMode === "schedule" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Week nav */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#fff",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={onPrev}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "7px 14px", color: "var(--color-text-muted)", fontSize: 16, lineHeight: 1,
              }}
            >
              ‹
            </button>
            <span
              style={{
                fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)",
                padding: "0 8px", whiteSpace: "nowrap",
              }}
            >
              {weekLabel}
            </span>
            <button
              onClick={onToday}
              style={{
                background: "none", border: "none",
                borderLeft: "1px solid var(--color-border)",
                borderRight: "1px solid var(--color-border)",
                cursor: "pointer", padding: "7px 12px",
                color: "var(--color-text-muted)", fontSize: 12, fontWeight: 600,
              }}
            >
              Today
            </button>
            <button
              onClick={onNext}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "7px 14px", color: "var(--color-text-muted)", fontSize: 16, lineHeight: 1,
              }}
            >
              ›
            </button>
          </div>

          {/* 1W / 2W / M toggle */}
          <div
            style={{
              display: "flex", background: "#fff", borderRadius: 10,
              border: "1px solid var(--color-border)", overflow: "hidden",
            }}
          >
            {([1, 2, "month"] as const).map((n) => (
              <button
                key={n}
                onClick={() => onSpanChange(n)}
                style={{
                  background: spanWeeks === n ? "var(--color-dark)" : "none",
                  border: "none",
                  color: spanWeeks === n ? "#fff" : "var(--color-text-muted)",
                  padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  borderRight: n !== "month" ? "1px solid var(--color-border)" : "none",
                }}
              >
                {n === "month" ? "M" : `${n}W`}
              </button>
            ))}
          </div>

          {/* Wing filter */}
          <div
            style={{
              display: "flex", background: "#fff", borderRadius: 10,
              border: "1px solid var(--color-border)", overflow: "hidden",
            }}
          >
            {wingOptions.map((w, i) => (
              <button
                key={w.name}
                onClick={() => onWingChange(w.name)}
                style={{
                  background: activeWing === w.name ? "var(--color-dark)" : "none",
                  border: "none",
                  color: activeWing === w.name ? "#fff" : "var(--color-text-muted)",
                  padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  borderRight: i < wingOptions.length - 1 ? "1px solid var(--color-border)" : "none",
                }}
              >
                {w.name}
              </button>
            ))}
          </div>

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
              style={{
                background: "#fff", border: "1px solid var(--color-border)", borderRadius: 10,
                padding: "7px 10px 7px 30px", fontSize: 12, fontWeight: 500,
                color: "var(--color-text-secondary)", width: 160, outline: "none",
              }}
            />
            {staffSearch && (
              <button
                onClick={() => onStaffSearchChange("")}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--color-text-faint)", fontSize: 14, lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Tools dropdown */}
      <div ref={toolsRef} style={{ position: "relative" }}>
        <button
          onClick={() => setToolsOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: toolsOpen ? "var(--color-dark)" : "#fff",
            border: "1px solid var(--color-border)", borderRadius: 10,
            padding: "7px 14px", fontSize: 12, fontWeight: 600,
            color: toolsOpen ? "#fff" : "var(--color-text-muted)", cursor: "pointer",
          }}
        >
          Tools <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
        </button>
        {toolsOpen && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              background: "#fff", border: "1px solid var(--color-border)",
              borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              zIndex: 100, minWidth: 190, overflow: "hidden",
            }}
          >
            <button
              onClick={() => { setToolsOpen(false); window.print(); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                background: "none", border: "none", padding: "11px 16px",
                fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-border-light)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              🖨️ Print / Save as PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
