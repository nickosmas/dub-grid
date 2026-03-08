"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { formatDate } from "@/lib/utils";
import { EditModalState, Section, ShiftType } from "@/types";

interface EditShiftModalProps {
  modal: EditModalState;
  currentShift: string | null;
  shiftTypes: ShiftType[];
  onSelect: (label: string) => void;
  onClose: () => void;
}

export default function EditShiftModal({
  modal,
  currentShift,
  shiftTypes,
  onSelect,
  onClose,
}: EditShiftModalProps) {
  // All wing names present in shift types
  const allWingNames: string[] = [];
  for (const st of shiftTypes) {
    if (st.wingName && !allWingNames.includes(st.wingName)) {
      allWingNames.push(st.wingName);
    }
  }

  // Employee's assigned wings first (primary first), then other sections
  const tabs: Section[] = [
    ...modal.empWings,
    ...allWingNames.filter((w) => !modal.empWings.includes(w)),
  ];

  const [activeTab, setActiveTab] = useState<Section>(
    modal.empWings[0] || tabs[0] || "",
  );

  const wingShifts = shiftTypes.filter((st) => st.wingName === activeTab);
  const generalShifts = shiftTypes.filter((st) => st.isGeneral);

  function renderShiftButton(s: ShiftType) {
    const isActive = currentShift === s.label;
    return (
      <button
        key={s.label}
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
      {/* Wing tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "2px solid var(--color-border)",
          paddingBottom: 0,
        }}
      >
        {tabs.map((wing) => {
          const isActive = wing === activeTab;
          const isHome = wing === modal.empWings[0];
          return (
            <button
              key={wing}
              onClick={() => setActiveTab(wing)}
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
              {wing}
              {isHome ? " ★" : ""}
            </button>
          );
        })}
      </div>

      {/* Wing-specific shifts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {wingShifts.map((s) => renderShiftButton(s))}
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
