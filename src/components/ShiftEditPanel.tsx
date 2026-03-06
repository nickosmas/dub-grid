"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { EditModalState, ShiftType } from "@/types";

interface ShiftEditPanelProps {
  modal: EditModalState;
  currentShift: string | null;
  shiftTypes: ShiftType[];
  onSelect: (label: string) => void;
  onClose: () => void;
}

export default function ShiftEditPanel({
  modal,
  currentShift,
  shiftTypes,
  onSelect,
  onClose,
}: ShiftEditPanelProps) {
  // All wing names present in shift types (ordered by first occurrence)
  const allWingNames: string[] = [];
  for (const st of shiftTypes) {
    if (st.wingName && !allWingNames.includes(st.wingName)) {
      allWingNames.push(st.wingName);
    }
  }

  // Tabs: employee's wings first, then others
  const tabs: string[] = [
    ...modal.empWings,
    ...allWingNames.filter((w) => !modal.empWings.includes(w)),
  ];

  const [activeTab, setActiveTab] = useState<string>(modal.empWings[0] || tabs[0] || "");

  const wingShifts = shiftTypes.filter((st) => st.wingName === activeTab);
  const generalShifts = shiftTypes.filter((st) => st.isGeneral);

  function renderShiftButton(s: ShiftType) {
    const isActive = currentShift === s.label;
    return (
      <button
        key={s.label}
        onClick={() => onSelect(s.label)}
        style={{
          background: isActive ? s.color : "#fff",
          border: `1.5px solid ${isActive ? s.border : "var(--color-border)"}`,
          borderRadius: 8,
          padding: "10px",
          cursor: "pointer",
          textAlign: "left",
          transition: "border-color 0.1s",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? s.text : "var(--color-text-secondary)" }}>
          {s.label}
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
          {s.name}
        </div>
      </button>
    );
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 340,
          background: "#fff", zIndex: 201,
          boxShadow: "-4px 0 32px rgba(0,0,0,0.13)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-secondary)" }}>
              {modal.empName}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 3 }}>
              {formatDate(modal.date)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid var(--color-border)", borderRadius: 6,
              cursor: "pointer", color: "var(--color-text-muted)", fontSize: 16, lineHeight: 1,
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
          {/* Wing tabs */}
          {tabs.length > 0 && (
            <div
              style={{
                display: "flex", gap: 2, marginBottom: 14,
                borderBottom: "1px solid var(--color-border)", overflowX: "auto",
              }}
            >
              {tabs.map((wing) => {
                const isActive = wing === activeTab;
                const isHome = modal.empWings.includes(wing) && wing === modal.empWings[0];
                return (
                  <button
                    key={wing}
                    onClick={() => setActiveTab(wing)}
                    style={{
                      padding: "6px 10px", fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer", border: "none",
                      borderBottom: isActive ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                      background: "transparent",
                      color: isActive ? "var(--color-text-primary)" : "var(--color-text-subtle)",
                      marginBottom: -1, whiteSpace: "nowrap",
                    }}
                  >
                    {wing}{isHome ? " ★" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* Wing-specific shifts */}
          {wingShifts.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {wingShifts.map((s) => renderShiftButton(s))}
            </div>
          )}

          {/* General shifts */}
          {generalShifts.length > 0 && (
            <>
              <div
                style={{
                  margin: "12px 0 8px", fontSize: 10, fontWeight: 600,
                  color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em",
                }}
              >
                General
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {generalShifts.map((s) => renderShiftButton(s))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
