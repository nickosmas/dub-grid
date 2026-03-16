"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { formatDate } from "@/lib/utils";
import { EditModalState, FocusArea, ShiftCode } from "@/types";

interface EditShiftModalProps {
  modal: EditModalState;
  currentShift: string | null;
  shiftCodes: ShiftCode[];
  focusAreas?: FocusArea[];
  onSelect: (label: string) => void;
  onClose: () => void;
}

export default function EditShiftModal({
  modal,
  currentShift,
  shiftCodes,
  focusAreas = [],
  onSelect,
  onClose,
}: EditShiftModalProps) {
  // All focus area names present in shift codes (resolved via focusAreaId)
  const allFocusAreaNames: string[] = [];
  for (const st of shiftCodes) {
    if (st.focusAreaId != null) {
      const fa = focusAreas.find((f) => f.id === st.focusAreaId);
      if (fa && !allFocusAreaNames.includes(fa.name)) {
        allFocusAreaNames.push(fa.name);
      }
    }
  }

  // Resolve employee's focus area IDs to names (preserving order, primary first)
  const empFocusAreaNames: string[] = modal.empFocusAreaIds
    .map((id) => focusAreas.find((fa) => fa.id === id)?.name)
    .filter((name): name is string => name != null);

  // Employee's assigned focus areas first (primary first), then other sections
  const tabs: string[] = [
    ...empFocusAreaNames,
    ...allFocusAreaNames.filter((w) => !empFocusAreaNames.includes(w)),
  ];

  const [activeTab, setActiveTab] = useState<string>(
    empFocusAreaNames[0] || tabs[0] || "",
  );

  const activeFocusAreaId = focusAreas.find((fa) => fa.name === activeTab)?.id;
  const focusAreaShifts = shiftCodes.filter((st) => st.focusAreaId != null && st.focusAreaId === activeFocusAreaId);
  const generalShifts = shiftCodes.filter((st) => st.isGeneral);

  function renderShiftButton(s: ShiftCode) {
    const isActive = currentShift === s.label;
    return (
      <button
        key={s.id}
        onClick={() => onSelect(s.label)}
        style={{
          background: isActive ? s.color : "var(--color-bg)",
          border: `2px solid ${isActive ? s.border : "var(--color-border)"}`,
          borderRadius: 10,
          padding: "14px 12px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: isActive ? s.text : "var(--color-text-secondary)",
          }}
        >
          {s.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-subtle)",
            marginTop: 2,
          }}
        >
          {s.name}
        </div>
      </button>
    );
  }

  return (
    <Modal
      title={`${modal.empName} — ${formatDate(modal.date)}`}
      onClose={onClose}
    >
      {/* Focus area tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "2px solid var(--color-border)",
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const isHome = tab === empFocusAreaNames[0];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--color-text-primary)"
                  : "2px solid transparent",
                background: "transparent",
                color: isActive
                  ? "var(--color-text-primary)"
                  : "var(--color-text-subtle)",
                marginBottom: -2,
                whiteSpace: "nowrap",
              }}
            >
              {tab}
              {isHome ? " ★" : ""}
            </button>
          );
        })}
      </div>

      {/* Focus area-specific shifts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {focusAreaShifts.map((s) => renderShiftButton(s))}
      </div>

      {/* General shifts divider */}
      <div
        style={{
          margin: "14px 0 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        General
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {generalShifts.map((s) => renderShiftButton(s))}
      </div>
    </Modal>
  );
}
