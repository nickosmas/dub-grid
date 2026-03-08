"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { EditModalState, ShiftType, NoteType } from "@/types";

interface ShiftEditPanelProps {
  modal: EditModalState;
  currentShift: string | null;
  shiftTypes: ShiftType[];
  onSelect: (label: string) => void;
  onClose: () => void;
  allowShiftEdits?: boolean;
  canEditNotes?: boolean;
  noteTypes?: NoteType[];
  onNoteToggle?: (noteType: NoteType, active: boolean) => void;
}

export default function ShiftEditPanel({
  modal,
  currentShift,
  shiftTypes,
  onSelect,
  onClose,
  allowShiftEdits = true,
  canEditNotes = false,
  noteTypes = [],
  onNoteToggle,
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

  const [activeTab, setActiveTab] = useState<string>(
    modal.empWings[0] || tabs[0] || "",
  );

  function isQualified(s: ShiftType) {
    return (
      !s.requiredDesignations?.length ||
      s.requiredDesignations.includes(modal.empDesignation)
    );
  }

  const wingShifts = shiftTypes.filter(
    (st) => st.wingName === activeTab && isQualified(st),
  );
  const generalShifts = shiftTypes.filter((st) => st.isGeneral && isQualified(st));

  function renderShiftButton(s: ShiftType) {
    const isActive = currentShift === s.label;
    const disabled = !allowShiftEdits;

    return (
      <button
        key={s.label}
        onClick={() => allowShiftEdits && onSelect(s.label)}
        disabled={disabled}
        style={{
          background: isActive ? s.color : "#fff",
          border: `1.5px solid ${isActive ? s.border : "var(--color-border)"}`,
          borderRadius: 8,
          padding: "10px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: allowShiftEdits ? 1 : 0.5,
          textAlign: "left",
          transition: "border-color 150ms ease, background 150ms ease",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isActive) {
            e.currentTarget.style.borderColor = s.border;
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isActive) {
            e.currentTarget.style.borderColor = "var(--color-border)";
          }
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: isActive ? s.text : "var(--color-text-secondary)",
          }}
        >
          {s.label}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-subtle)",
            marginTop: 1,
          }}
        >
          {s.name}
        </div>
      </button>
    );
  }

  const sectionLabel: React.CSSProperties = {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <>
      {/* Backdrop */}
      <div className="dg-panel-overlay" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="dg-panel">
        {/* Panel Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexShrink: 0,
            background: "#fff",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--color-text-secondary)",
              }}
            >
              {modal.empName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-subtle)",
                marginTop: 2,
              }}
            >
              {formatDate(modal.date)}
              {modal.empDesignation && (
                <>
                  {" · "}
                  <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>
                    {modal.empDesignation}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="dg-btn dg-btn-ghost"
            style={{ border: "1px solid var(--color-border)", padding: "4px 8px", fontSize: 16, lineHeight: 1 }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Wing tabs (Tier 2 sub-tabs) */}
        {tabs.length > 0 && (
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--color-border)",
              overflowX: "auto",
              flexShrink: 0,
              background: "#fff",
              paddingLeft: 16,
              paddingRight: 16,
            }}
          >
            {tabs.map((wing) => {
              const isActive = wing === activeTab;
              const isHome =
                modal.empWings.includes(wing) && wing === modal.empWings[0];
              return (
                <button
                  key={wing}
                  onClick={() => setActiveTab(wing)}
                  className={`dg-sub-tab${isActive ? " active" : ""}`}
                  style={{ fontSize: 12 }}
                >
                  {wing}
                  {isHome ? " ★" : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {allowShiftEdits ? (
            <>
              {/* Wing-specific shifts */}
              {wingShifts.length > 0 && (
                <>
                  <div style={sectionLabel}>Shift Assignment</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    {wingShifts.map((s) => renderShiftButton(s))}
                  </div>
                </>
              )}

              {/* General shifts */}
              {generalShifts.length > 0 && (
                <>
                  <div style={{ ...sectionLabel, marginTop: wingShifts.length > 0 ? 4 : 0 }}>General</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    {generalShifts.map((s) => renderShiftButton(s))}
                  </div>
                </>
              )}

              {wingShifts.length === 0 && generalShifts.length === 0 && (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "var(--color-text-subtle)",
                    fontSize: 13,
                  }}
                >
                  No shifts available for this wing.
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "12px",
                fontSize: 13,
                color: "var(--color-text-muted)",
              }}
            >
              Shift editing is disabled for your role.
            </div>
          )}

          {/* Indicators / Notes */}
          {canEditNotes && (
            <div style={{ marginTop: 24 }}>
              <div style={sectionLabel}>Indicators</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(
                  [
                    { type: "readings" as NoteType, label: "Readings", color: "#EF4444", desc: "Appears as a red dot" },
                    { type: "shower" as NoteType, label: "Shower", color: "#1E293B", desc: "Appears as a black dot" },
                  ] as { type: NoteType; label: string; color: string; desc: string }[]
                ).map(({ type, label, color, desc }) => {
                  const isActive = noteTypes.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => onNoteToggle?.(type, !isActive)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: `1.5px solid ${isActive ? color : "var(--color-border)"}`,
                        borderRadius: 8,
                        background: isActive ? `${color}18` : "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "border-color 150ms ease, background 150ms ease",
                        width: "100%",
                        fontFamily: "inherit",
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: isActive ? color : "var(--color-text-secondary)",
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-subtle)",
                            marginTop: 1,
                          }}
                        >
                          {desc}
                        </div>
                      </div>
                      {isActive && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: color,
                            flexShrink: 0,
                          }}
                        >
                          ON
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
