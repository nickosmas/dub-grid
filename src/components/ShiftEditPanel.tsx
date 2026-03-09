"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { EditModalState, ShiftType, NoteType, SeriesScope } from "@/types";

interface ShiftEditPanelProps {
  modal: EditModalState;
  currentShift: string | null;
  shiftTypes: ShiftType[];
  onSelect: (label: string, seriesScope?: SeriesScope) => void;
  onClose: () => void;
  allowShiftEdits?: boolean;
  canEditNotes?: boolean;
  getNoteTypes?: (wingName: string) => NoteType[];
  onNoteToggle?: (noteType: NoteType, active: boolean, wingName: string) => void;
  /** Series ID if the current shift belongs to a repeating series */
  seriesId?: string | null;
  /** Called when the user wants to create a repeating shift for the current selection */
  onMakeRepeating?: () => void;
}

export default function ShiftEditPanel({
  modal,
  currentShift,
  shiftTypes,
  onSelect,
  onClose,
  allowShiftEdits = true,
  canEditNotes = false,
  getNoteTypes,
  onNoteToggle,
  seriesId,
  onMakeRepeating,
}: ShiftEditPanelProps) {
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("this");

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const [showPicker, setShowPicker] = useState(!hasActiveShift);

  // Capture initial state at mount so Cancel can revert
  const [initialShift] = useState(() => currentShift);
  const [initialNotesByWing] = useState<Record<string, NoteType[]>>(() => {
    if (!getNoteTypes) return {};
    const wings = new Set<string>(modal.empWings);
    for (const st of shiftTypes) {
      if (st.wingName) wings.add(st.wingName);
    }
    const record: Record<string, NoteType[]> = {};
    for (const wing of wings) {
      record[wing] = [...getNoteTypes(wing)];
    }
    return record;
  });

  // Derive whether any edits have been made since panel opened
  const hasShiftEdit = currentShift !== initialShift;
  const hasNoteEdit = (() => {
    if (!getNoteTypes) return false;
    for (const [wing, initTypes] of Object.entries(initialNotesByWing)) {
      const curTypes = getNoteTypes(wing);
      if (curTypes.length !== initTypes.length) return true;
      if (curTypes.some((t) => !initTypes.includes(t))) return true;
    }
    return false;
  })();
  const hasEdits = hasShiftEdit || hasNoteEdit;

  function handleUndo() {
    // Revert shift if it changed
    if (currentShift !== initialShift) {
      onSelect(initialShift ?? "OFF");
    }
    // Revert notes for each wing
    if (getNoteTypes) {
      for (const [wing, initTypes] of Object.entries(initialNotesByWing)) {
        const curTypes = getNoteTypes(wing);
        for (const type of initTypes) {
          if (!curTypes.includes(type)) onNoteToggle?.(type, true, wing);
        }
        for (const type of curTypes) {
          if (!initTypes.includes(type)) onNoteToggle?.(type, false, wing);
        }
      }
    }
    // Do NOT close — panel stays open after undo
  }

  // When shift is cleared externally, return to picker
  useEffect(() => {
    if (!currentShift || currentShift === "OFF") {
      setShowPicker(true);
    }
  }, [currentShift]);

  // Wing tab setup
  const allWingNames: string[] = [];
  for (const st of shiftTypes) {
    if (st.wingName && !allWingNames.includes(st.wingName)) {
      allWingNames.push(st.wingName);
    }
  }
  const tabs: string[] = [
    ...modal.empWings,
    ...allWingNames.filter((w) => !modal.empWings.includes(w)),
  ];
  const [activeTab, setActiveTab] = useState<string>(
    modal.empWings[0] || tabs[0] || "",
  );

  const currentLabels = currentShift
    ? currentShift.split("/").filter((l) => l !== "OFF")
    : [];

  function isQualified(s: ShiftType) {
    return (
      !s.requiredDesignations?.length ||
      s.requiredDesignations.includes(modal.empDesignation)
    );
  }

  const wingShifts = shiftTypes.filter(
    (st) => st.wingName === activeTab && isQualified(st),
  );
  const generalShifts = shiftTypes.filter(
    (st) => st.isGeneral && isQualified(st),
  );

  const sectionLabel: React.CSSProperties = {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  function getShiftTypeStyle(label: string) {
    return (
      shiftTypes.find((st) => st.label === label) ?? {
        color: "#F8FAFC",
        border: "#CBD5E1",
        text: "#64748B",
      }
    );
  }

  function renderNoteDots(noteTypes: NoteType[], side: "left" | "right" = "right") {
    if (noteTypes.length === 0) return null;
    return (
      <div
        style={{
          position: "absolute",
          top: 8,
          ...(side === "left" ? { left: 10 } : { right: 10 }),
          display: "flex",
          gap: 3,
        }}
      >
        {noteTypes.includes("readings") && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#EF4444",
              border: "1px solid rgba(255,255,255,0.8)",
              flexShrink: 0,
            }}
          />
        )}
        {noteTypes.includes("shower") && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#1E293B",
              border: "1px solid rgba(255,255,255,0.8)",
              flexShrink: 0,
            }}
          />
        )}
      </div>
    );
  }

  function renderCurrentShiftPill() {
    if (!hasActiveShift || currentLabels.length === 0) return null;
    const noteTypes = getNoteTypes ? getNoteTypes(activeTab) : [];

    if (currentLabels.length === 1) {
      const label = currentLabels[0];
      const s = getShiftTypeStyle(label);
      const fullName = (s as ShiftType).name && (s as ShiftType).name !== label ? (s as ShiftType).name : null;
      return (
        <div
          style={{
            background: s.color,
            border: `1.5px solid ${s.border}`,
            borderRadius: 10,
            height: 72,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginBottom: 16,
            gap: 2,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 20, color: s.text, lineHeight: 1 }}>
            {label}
          </span>
          {fullName && (
            <span style={{ fontSize: 11, color: s.text, opacity: 0.7, lineHeight: 1 }}>
              {fullName}
            </span>
          )}
          {renderNoteDots(noteTypes)}
        </div>
      );
    }

    // Multi-shift: individual stacked pills, each with its own indicators
    return (
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {currentLabels.map((label, i) => {
          const s = getShiftTypeStyle(label);
          const fullName = (s as ShiftType).name && (s as ShiftType).name !== label ? (s as ShiftType).name : null;
          const shiftWing = shiftTypes.find((st) => st.label === label)?.wingName ?? activeTab;
          const pillNoteTypes = getNoteTypes ? getNoteTypes(shiftWing) : [];
          return (
            <div key={label + i}>
              {/* Pill */}
              <div
                style={{
                  background: s.color,
                  border: `1.5px solid ${s.border}`,
                  borderRadius: 10,
                  height: 64,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  gap: 2,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 18, color: s.text, lineHeight: 1 }}>
                  {label}
                </span>
                {fullName && (
                  <span style={{ fontSize: 11, color: s.text, opacity: 0.7, lineHeight: 1 }}>
                    {fullName}
                  </span>
                )}
                {/* Per-pill remove button */}
                {allowShiftEdits && (
                  <button
                    onClick={() => {
                      const remaining = currentLabels.filter((_, j) => j !== i);
                      onSelect(
                        remaining.length > 0 ? remaining.join("/") : "OFF",
                        seriesId ? seriesScope : undefined,
                      );
                    }}
                    title={`Remove ${label}`}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 10,
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      border: "none",
                      background: "rgba(0,0,0,0.12)",
                      color: s.text,
                      fontSize: 15,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "inherit",
                    }}
                  >
                    ×
                  </button>
                )}
                {/* Note dots inside pill — left side to avoid colliding with × button */}
                {renderNoteDots(pillNoteTypes, "left")}
              </div>
              {/* Inline indicators for this shift's wing */}
              {renderInlineIndicators(shiftWing)}
            </div>
          );
        })}
      </div>
    );
  }

  function renderInlineIndicators(wingName: string) {
    if (!canEditNotes) return null;
    const noteTypeDefs = [
      { type: "readings" as NoteType, label: "Readings", color: "#EF4444" },
      { type: "shower" as NoteType, label: "Shower", color: "#1E293B" },
    ];
    return (
      <div style={{ display: "flex", gap: 6, paddingTop: 6 }}>
        {noteTypeDefs.map(({ type, label, color }) => {
          const isActive = getNoteTypes ? getNoteTypes(wingName).includes(type) : false;
          return (
            <button
              key={type}
              onClick={() => onNoteToggle?.(type, !isActive, wingName)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                border: `1.5px solid ${isActive ? color : "var(--color-border)"}`,
                borderRadius: 20,
                background: isActive ? `${color}18` : "#fff",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? color : "var(--color-text-subtle)",
                fontFamily: "inherit",
                transition: "border-color 150ms ease, background 150ms ease",
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isActive ? color : "var(--color-border)",
                  flexShrink: 0,
                }}
              />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderNotesSection() {
    if (!canEditNotes) return null;
    return (
      <div>
        <div style={sectionLabel}>Indicators</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(
            [
              {
                type: "readings" as NoteType,
                label: "Readings",
                color: "#EF4444",
                desc: "Appears as a red dot",
              },
              {
                type: "shower" as NoteType,
                label: "Shower",
                color: "#1E293B",
                desc: "Appears as a black dot",
              },
            ] as { type: NoteType; label: string; color: string; desc: string }[]
          ).map(({ type, label, color, desc }) => {
            const isActive = getNoteTypes
              ? getNoteTypes(activeTab).includes(type)
              : false;
            return (
              <button
                key={type}
                onClick={() => onNoteToggle?.(type, !isActive, activeTab)}
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
                    style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}
                  >
                    ON
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderShiftButton(s: ShiftType) {
    const isActive = currentLabels.includes(s.label);
    const disabled = !allowShiftEdits;

    const handleToggle = () => {
      if (!allowShiftEdits) return;
      let newLabels: string[];
      if (isActive) {
        newLabels = currentLabels.filter((l) => l !== s.label);
      } else {
        newLabels = [...currentLabels, s.label];
      }
      newLabels = newLabels.filter((l) => l !== "OFF");
      const newShift = newLabels.length > 0 ? newLabels.join("/") : "OFF";
      onSelect(newShift, seriesId ? seriesScope : undefined);
      if (newShift !== "OFF") {
        setShowPicker(false);
      }
    };

    return (
      <button
        key={s.label}
        onClick={handleToggle}
        disabled={disabled}
        style={{
          background: isActive ? s.color : "#fff",
          border: `1.5px solid ${s.border}`,
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
            e.currentTarget.style.background = `${s.color}15`;
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isActive) {
            e.currentTarget.style.background = "#fff";
          }
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: isActive ? s.text : s.border,
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

  // Detail mode: show when we have an active shift and aren't in picker mode
  // (or when shift edits are not allowed)
  const inDetailMode = !allowShiftEdits || (!showPicker && hasActiveShift);

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
                  <span
                    style={{
                      color: "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {modal.empDesignation}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="dg-btn dg-btn-ghost"
            style={{
              border: "1px solid var(--color-border)",
              padding: "4px 8px",
              fontSize: 16,
              lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Wing tabs */}
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
          {inDetailMode ? (
            // ── Detail mode ──────────────────────────────────────────────────
            <>
              {/* Current shift displayed prominently */}
              {renderCurrentShiftPill()}

              {!hasActiveShift && !allowShiftEdits && (
                <div
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: "12px",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    marginBottom: 16,
                  }}
                >
                  Shift editing is disabled for your role.
                </div>
              )}

              {/* Series scope selector — shown when editing a repeating shift */}
              {allowShiftEdits && seriesId && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    background: "#FFFBEB",
                    border: "1px solid #FCD34D",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      ...sectionLabel,
                      marginBottom: 6,
                      color: "#92400E",
                    }}
                  >
                    Repeating shift — edit scope
                  </div>
                  <div className="dg-segment" style={{ display: "flex" }}>
                    <button
                      onClick={() => setSeriesScope("this")}
                      className={`dg-segment-btn${seriesScope === "this" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: 11 }}
                    >
                      This shift
                    </button>
                    <button
                      onClick={() => setSeriesScope("all")}
                      className={`dg-segment-btn${seriesScope === "all" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: 11 }}
                    >
                      All in series
                    </button>
                  </div>
                </div>
              )}

              {/* Make repeating */}
              {allowShiftEdits && hasActiveShift && !seriesId && onMakeRepeating && (
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionLabel}>Repeating</div>
                  <button
                    onClick={onMakeRepeating}
                    className="dg-btn"
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontSize: 12,
                      padding: "9px 12px",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                    Make this a repeating shift…
                  </button>
                </div>
              )}

              {/* Notes / Indicators — single shift only; multi-shift shows inline per pill */}
              {currentLabels.length <= 1 && renderNotesSection()}

              {/* Remove shift */}
              {allowShiftEdits && hasActiveShift && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => onSelect("OFF", seriesId ? seriesScope : undefined)}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      padding: "9px 12px",
                      border: "1px solid #FCA5A5",
                      borderRadius: 8,
                      background: "#fff",
                      color: "#EF4444",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontFamily: "inherit",
                      transition: "background 150ms ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF2F2"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    {currentLabels.length > 1 ? "Remove all shifts" : "Remove shift"}
                  </button>
                </div>
              )}

              {/* Add another shift */}
              {allowShiftEdits && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="dg-btn dg-btn-ghost"
                    style={{
                      width: "100%",
                      fontSize: 12,
                      padding: "9px 12px",
                      border: "1px dashed var(--color-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add another shift
                  </button>
                </div>
              )}
            </>
          ) : (
            // ── Picker mode ───────────────────────────────────────────────────
            <>
              {/* Back button when we already have an active shift */}
              {hasActiveShift && (
                <button
                  onClick={() => setShowPicker(false)}
                  className="dg-btn dg-btn-ghost"
                  style={{
                    fontSize: 12,
                    padding: "5px 10px",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
              )}

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
                  <div
                    style={{
                      ...sectionLabel,
                      marginTop: wingShifts.length > 0 ? 4 : 0,
                    }}
                  >
                    General
                  </div>
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
          )}
        </div>

        {/* Sticky footer — only shown when edits exist */}
        {hasEdits && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              gap: 8,
              background: "#fff",
            }}
          >
            <button
              onClick={handleUndo}
              className="dg-btn dg-btn-ghost"
              style={{
                flex: 1,
                fontSize: 12,
                padding: "9px 12px",
                border: "1px solid var(--color-border)",
              }}
            >
              Undo
            </button>
            <button
              onClick={onClose}
              className="dg-btn"
              style={{ flex: 1, fontSize: 12, padding: "9px 12px" }}
            >
              Save Draft
            </button>
          </div>
        )}
      </div>
    </>
  );
}
