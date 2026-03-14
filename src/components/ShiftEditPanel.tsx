"use client";

import { useState, useEffect } from "react";
import { formatDate, getCertName } from "@/lib/utils";
import { EditModalState, ShiftCode, NoteType, IndicatorType, SeriesScope, FocusArea, NamedItem } from "@/types";

interface ShiftEditPanelProps {
  modal: EditModalState;
  currentShift: string | null;
  currentShiftCodeIds?: number[];
  shiftCodes: ShiftCode[];
  indicatorTypes?: IndicatorType[];
  onSelect: (label: string, shiftCodeIds: number[], seriesScope?: SeriesScope) => void;
  onClose: () => void;
  allowShiftEdits?: boolean;
  canEditNotes?: boolean;
  getNoteTypes?: (focusAreaId: number) => NoteType[];
  onNoteToggle?: (noteType: NoteType, active: boolean, focusAreaId: number) => void;
  /** Series ID if the current shift belongs to a repeating series */
  seriesId?: string | null;
  /** Called when the user wants to create a repeating shift for the current selection */
  onMakeRepeating?: () => void;
  /** Current custom start time override for this shift (e.g. "07:30") */
  customStartTime?: string | null;
  /** Current custom end time override for this shift (e.g. "15:30") */
  customEndTime?: string | null;
  /** Called when user changes the custom time override */
  onCustomTimeChange?: (start: string | null, end: string | null) => void;
  /** All focus areas — used to resolve focusAreaId to names */
  focusAreas?: FocusArea[];
  /** All certifications — used to resolve certificationId to names */
  certifications?: NamedItem[];
}

// ── Time helpers ────────────────────────────────────────────────────────────
function parseTo12h(time24: string | null | undefined): { hour: string; minute: string; period: "AM" | "PM" } {
  if (!time24) return { hour: "", minute: "00", period: "AM" };
  const [h, m] = time24.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: String(m).padStart(2, "0"), period };
}

function to24h(hour: string, minute: string, period: "AM" | "PM"): string | null {
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (isNaN(h) || isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  const h24 = period === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const { hour, minute, period } = parseTo12h(time24);
  return `${hour}:${minute} ${period}`;
}
// ────────────────────────────────────────────────────────────────────────────

export default function ShiftEditPanel({
  modal,
  currentShift,
  currentShiftCodeIds = [],
  shiftCodes,
  indicatorTypes = [],
  onSelect,
  onClose,
  allowShiftEdits = true,
  canEditNotes = false,
  getNoteTypes,
  onNoteToggle,
  seriesId,
  onMakeRepeating,
  customStartTime,
  customEndTime,
  onCustomTimeChange,
  focusAreas = [],
  certifications = [],
}: ShiftEditPanelProps) {
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("this");

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const [showPicker, setShowPicker] = useState(!hasActiveShift);

  // Custom time state (12-hour format)
  const [showCustomTime, setShowCustomTime] = useState(!!(customStartTime || customEndTime));
  const [startH, setStartH] = useState(() => parseTo12h(customStartTime).hour);
  const [startM, setStartM] = useState(() => parseTo12h(customStartTime).minute);
  const [startP, setStartP] = useState<"AM" | "PM">(() => parseTo12h(customStartTime).period);
  const [endH, setEndH] = useState(() => parseTo12h(customEndTime).hour);
  const [endM, setEndM] = useState(() => parseTo12h(customEndTime).minute);
  const [endP, setEndP] = useState<"AM" | "PM">(() => parseTo12h(customEndTime).period);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  function commitCustomTime(sh: string, sm: string, sp: "AM" | "PM", eh: string, em: string, ep: "AM" | "PM") {
    const start = to24h(sh, sm, sp);
    const end = to24h(eh, em, ep);
    onCustomTimeChange?.(start, end);
  }

  // Capture initial state at mount so Cancel can revert
  const [initialShift] = useState(() => currentShift);
  const [initialShiftCodeIds] = useState(() => [...currentShiftCodeIds]);
  const [initialNotesByFocusArea] = useState<Record<number, NoteType[]>>(() => {
    if (!getNoteTypes) return {};
    const focusAreaIds = new Set<number>(modal.empFocusAreaIds);
    for (const st of shiftCodes) {
      if (st.focusAreaId != null) focusAreaIds.add(st.focusAreaId);
    }
    const record: Record<number, NoteType[]> = {};
    for (const faId of focusAreaIds) {
      record[faId] = [...getNoteTypes(faId)];
    }
    return record;
  });

  // Derive whether any edits have been made since panel opened
  const hasShiftEdit = currentShift !== initialShift;
  const hasNoteEdit = (() => {
    if (!getNoteTypes) return false;
    for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
      const curTypes = getNoteTypes(Number(faIdStr));
      if (curTypes.length !== initTypes.length) return true;
      if (curTypes.some((t) => !initTypes.includes(t))) return true;
    }
    return false;
  })();
  const hasEdits = hasShiftEdit || hasNoteEdit;

  function handleUndo() {
    // Revert shift if it changed
    if (currentShift !== initialShift) {
      onSelect(initialShift ?? "OFF", initialShiftCodeIds);
    }
    // Revert notes for each focus area
    if (getNoteTypes) {
      for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
        const faId = Number(faIdStr);
        const curTypes = getNoteTypes(faId);
        for (const type of initTypes) {
          if (!curTypes.includes(type)) onNoteToggle?.(type, true, faId);
        }
        for (const type of curTypes) {
          if (!initTypes.includes(type)) onNoteToggle?.(type, false, faId);
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

  // activeTab is internal-only (no visible tab bar); used for single-shift indicator context.
  const primaryFocusAreaId = modal.empFocusAreaIds[0] ?? 0;
  const [activeTab] = useState<number>(primaryFocusAreaId);

  // Picker tab: default to the section the cell was clicked in, then current shift's area, then primary
  const [pickerTab, setPickerTab] = useState<number>(() => {
    if (modal.activeFocusAreaId != null) return modal.activeFocusAreaId;
    const shiftFa = currentShiftCodeIds.length
      ? shiftCodes.find((s) => s.id === currentShiftCodeIds[0])?.focusAreaId
      : null;
    return shiftFa ?? modal.empFocusAreaIds[0] ?? 0;
  });

  const currentLabels = currentShift
    ? currentShift.split("/").filter((l) => l !== "OFF")
    : [];

  function isQualified(s: ShiftCode) {
    return (
      !s.requiredCertificationIds?.length ||
      (modal.empCertificationId != null && s.requiredCertificationIds.includes(modal.empCertificationId))
    );
  }

  // Shifts for a given focus area name (resolved via focusAreaId)
  function getShiftsForFocusArea(faName: string): ShiftCode[] {
    const faId = focusAreas.find((fa) => fa.name === faName)?.id;
    if (faId == null) return [];
    return shiftCodes.filter(
      (st) => !st.isGeneral && st.focusAreaId === faId && isQualified(st),
    );
  }


  // All focus areas that have shift codes, home areas first, then others
  const allPickerAreas = [
    ...focusAreas.filter(
      (fa) =>
        modal.empFocusAreaIds.includes(fa.id) &&
        shiftCodes.some((st) => !st.isGeneral && st.focusAreaId === fa.id && isQualified(st)),
    ),
    ...focusAreas.filter(
      (fa) =>
        !modal.empFocusAreaIds.includes(fa.id) &&
        shiftCodes.some((st) => !st.isGeneral && st.focusAreaId === fa.id && isQualified(st)),
    ),
  ];

  // Split general shifts into non-off-day (general) and off-day groups
  const generalNonOffShifts = shiftCodes.filter((st) => st.isGeneral && !st.isOffDay && isQualified(st));
  const offDayShifts = shiftCodes.filter((st) => st.isOffDay && isQualified(st));

  const sectionLabel: React.CSSProperties = {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  function getShiftCodeStyle(label: string, codeId?: number) {
    if (codeId != null) {
      const byId = shiftCodes.find((st) => st.id === codeId);
      if (byId) return byId;
    }
    return (
      shiftCodes.find((st) => st.label === label) ?? {
        color: "#F8FAFC",
        border: "#CBD5E1",
        text:"#475569",
      }
    );
  }

  function renderNoteDots(noteTypes: NoteType[], side: "left" | "right" = "right") {
    if (noteTypes.length === 0) return null;
    const activeDots = indicatorTypes.filter((ind) => noteTypes.includes(ind.name));
    if (activeDots.length === 0) return null;
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
        {activeDots.map((ind) => (
          <div
            key={ind.name}
            title={ind.name}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: ind.color,
              border: "1px solid rgba(255,255,255,0.8)",
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    );
  }

  function renderCurrentShiftPill() {
    if (!hasActiveShift || currentLabels.length === 0) return null;
    const noteTypes = getNoteTypes ? getNoteTypes(activeTab) : [];

    if (currentLabels.length === 1) {
      const label = currentLabels[0];
      const s = getShiftCodeStyle(label, currentShiftCodeIds[0]);
      const fullName = (s as ShiftCode).name && (s as ShiftCode).name !== label ? (s as ShiftCode).name : null;
      const faName = (s as ShiftCode).focusAreaId != null
        ? focusAreas.find(fa => fa.id === (s as ShiftCode).focusAreaId)?.name
        : undefined;
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
          {(fullName || faName) && (
            <span style={{ fontSize: 11, color: s.text, opacity: 0.7, lineHeight: 1 }}>
              {fullName}{fullName && faName ? " · " : ""}{faName}
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
          const s = getShiftCodeStyle(label, currentShiftCodeIds[i]);
          const fullName = (s as ShiftCode).name && (s as ShiftCode).name !== label ? (s as ShiftCode).name : null;
          const shiftCode = currentShiftCodeIds[i] != null
            ? shiftCodes.find((st) => st.id === currentShiftCodeIds[i])
            : shiftCodes.find((st) => st.label === label);
          const shiftFaId = shiftCode?.focusAreaId;
          const shiftWingId = shiftFaId ?? activeTab;
          const pillNoteTypes = getNoteTypes ? getNoteTypes(shiftWingId) : [];
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
                {(() => {
                  const faName = shiftCode?.focusAreaId != null
                    ? focusAreas.find(fa => fa.id === shiftCode.focusAreaId)?.name
                    : undefined;
                  return (fullName || faName) ? (
                    <span style={{ fontSize: 11, color: s.text, opacity: 0.7, lineHeight: 1 }}>
                      {fullName}{fullName && faName ? " · " : ""}{faName}
                    </span>
                  ) : null;
                })()}
                {/* Per-pill remove button */}
                {allowShiftEdits && (
                  <button
                    onClick={() => {
                      const remainingIds = currentShiftCodeIds.filter((_, j) => j !== i);
                      const remainingLabels = remainingIds
                        .map(id => shiftCodes.find(sc => sc.id === id)?.label)
                        .filter((l): l is string => l != null);
                      onSelect(
                        remainingLabels.length > 0 ? remainingLabels.join("/") : "OFF",
                        remainingIds,
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
              {/* Inline indicators for this shift's focus area */}
              {renderInlineIndicators(shiftWingId)}
            </div>
          );
        })}
      </div>
    );
  }

  function renderInlineIndicators(focusAreaId: number) {
    if (!canEditNotes || indicatorTypes.length === 0) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 6 }}>
        {indicatorTypes.map(({ name, color }) => {
          const isActive = getNoteTypes ? getNoteTypes(focusAreaId).includes(name) : false;
          return (
            <button
              key={name}
              onClick={() => onNoteToggle?.(name, !isActive, focusAreaId)}
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
              {name}
            </button>
          );
        })}
      </div>
    );
  }

  function renderNotesSection() {
    if (!canEditNotes || indicatorTypes.length === 0) return null;
    return (
      <div>
        <div style={sectionLabel}>Indicators</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {indicatorTypes.map(({ name, color }) => {
            const isActive = getNoteTypes ? getNoteTypes(activeTab).includes(name) : false;
            return (
              <button
                key={name}
                onClick={() => onNoteToggle?.(name, !isActive, activeTab)}
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
                  <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? color : "var(--color-text-secondary)" }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
                    Appears as a colored dot
                  </div>
                </div>
                {isActive && (
                  <div style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>ON</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderShiftButton(s: ShiftCode) {
    const isActive = currentShiftCodeIds.includes(s.id);
    const disabled = !allowShiftEdits;

    const handleToggle = () => {
      if (!allowShiftEdits) return;
      let newIds: number[];
      if (isActive) {
        // Remove this specific shift code by ID
        newIds = currentShiftCodeIds.filter(id => id !== s.id);
      } else {
        // Add this specific shift code by ID
        newIds = [...currentShiftCodeIds, s.id];
      }
      const newLabels = newIds
        .map(id => shiftCodes.find(sc => sc.id === id)?.label)
        .filter((l): l is string => l != null && l !== "OFF");
      const newShift = newLabels.length > 0 ? newLabels.join("/") : "OFF";
      onSelect(newShift, newIds, seriesId ? seriesScope : undefined);
      if (newShift !== "OFF") {
        setShowPicker(false);
      }
    };

    return (
      <button
        key={s.id}
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
              {modal.empCertificationId != null && (
                <>
                  {" · "}
                  <span
                    style={{
                      color: "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {getCertName(modal.empCertificationId, certifications)}
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


        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {inDetailMode ? (
            // ── Detail mode ──────────────────────────────────────────────────
            <>
              {/* Current shift displayed prominently */}
              {renderCurrentShiftPill()}

              {/* Custom time override — single active shifts only */}
              {hasActiveShift && allowShiftEdits && onCustomTimeChange && currentLabels.length === 1 && (() => {
                const defaultStart = shiftCodes.find(st => st.label === currentLabels[0])?.defaultStartTime ?? null;
                function handleUndoCustomTime() {
                  const s = parseTo12h(customStartTime); const e = parseTo12h(customEndTime);
                  setStartH(s.hour); setStartM(s.minute); setStartP(s.period);
                  setEndH(e.hour); setEndM(e.minute); setEndP(e.period);
                }
                const inputSt: React.CSSProperties = {
                  width: 32, padding: "7px 2px",
                  border: "1px solid var(--color-border)", borderRadius: 6,
                  fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                  background: "#fff", textAlign: "center", boxSizing: "border-box",
                  outline: "none",
                };
                function AmPm({ value, onChange }: { value: "AM" | "PM"; onChange: (v: "AM" | "PM") => void }) {
                  return (
                    <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      {(["AM", "PM"] as const).map((p) => (
                        <button key={p} onClick={() => onChange(p)} style={{
                          padding: "7px 6px", fontSize: 10, fontWeight: 700, border: "none",
                          borderRight: p === "AM" ? "1px solid var(--color-border)" : "none",
                          background: value === p ? "var(--color-text-secondary)" : "#fff",
                          color: value === p ? "#fff" : "var(--color-text-subtle)",
                          cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
                          transition: "background 100ms ease, color 100ms ease",
                        }}>{p}</button>
                      ))}
                    </div>
                  );
                }
                return (
                  <div style={{ marginBottom: 16 }}>
                    {!showCustomTime ? (
                      <button
                        onClick={() => setShowCustomTime(true)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                          color: "var(--color-text-subtle)", background: "none",
                          border: "1px dashed var(--color-border)", borderRadius: 7,
                          padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                          width: "100%", justifyContent: "center",
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        Set custom time
                        {defaultStart && <span style={{ marginLeft: 2, opacity: 0.6 }}>· default {fmt12h(defaultStart)}</span>}
                      </button>
                    ) : (
                      <div style={{ background: "#F8FAFC", border: "1px solid var(--color-border)", borderRadius: 10, padding: "12px" }}>
                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Custom Time</span>
                          <button
                            onClick={() => { setShowCustomTime(false); onCustomTimeChange(null, null); }}
                            style={{ fontSize: 11, color: "var(--color-text-subtle)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                          >Remove</button>
                        </div>

                        {/* Single row: [H]:[M][AM/PM] → [H]:[M][AM/PM] */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
                          {/* Start */}
                          <input type="text" inputMode="numeric" value={startH} placeholder={focusedField === "sH" ? "" : "8"} maxLength={2}
                            onFocus={() => { setFocusedField("sH"); setStartH(""); }}
                            onChange={(e) => setStartH(e.target.value.replace(/\D/g, ""))}
                            onBlur={(e) => { setFocusedField(null); if (!e.target.value) setStartH(parseTo12h(customStartTime).hour); }}
                            style={inputSt}
                          />
                          <span style={{ fontSize: 14, color: "var(--color-text-subtle)", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>:</span>
                          <input type="text" inputMode="numeric" value={startM} placeholder={focusedField === "sM" ? "" : "00"} maxLength={2}
                            onFocus={() => { setFocusedField("sM"); setStartM(""); }}
                            onChange={(e) => setStartM(e.target.value.replace(/\D/g, ""))}
                            onBlur={(e) => { setFocusedField(null); if (!e.target.value) setStartM(parseTo12h(customStartTime).minute); else setStartM(e.target.value.padStart(2, "0")); }}
                            style={inputSt}
                          />
                          <AmPm value={startP} onChange={setStartP} />

                          {/* Divider */}
                          <span style={{ color: "var(--color-text-subtle)", fontSize: 11, fontWeight: 500, flexShrink: 0, margin: "0 3px" }}>→</span>

                          {/* End */}
                          <input type="text" inputMode="numeric" value={endH} placeholder={focusedField === "eH" ? "" : "4"} maxLength={2}
                            onFocus={() => { setFocusedField("eH"); setEndH(""); }}
                            onChange={(e) => setEndH(e.target.value.replace(/\D/g, ""))}
                            onBlur={(e) => { setFocusedField(null); if (!e.target.value) setEndH(parseTo12h(customEndTime).hour); }}
                            style={inputSt}
                          />
                          <span style={{ fontSize: 14, color: "var(--color-text-subtle)", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>:</span>
                          <input type="text" inputMode="numeric" value={endM} placeholder={focusedField === "eM" ? "" : "00"} maxLength={2}
                            onFocus={() => { setFocusedField("eM"); setEndM(""); }}
                            onChange={(e) => setEndM(e.target.value.replace(/\D/g, ""))}
                            onBlur={(e) => { setFocusedField(null); if (!e.target.value) setEndM(parseTo12h(customEndTime).minute); else setEndM(e.target.value.padStart(2, "0")); }}
                            style={inputSt}
                          />
                          <AmPm value={endP} onChange={setEndP} />
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 7 }}>
                          <button onClick={handleUndoCustomTime} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 500, border: "1px solid var(--color-border)", borderRadius: 7, background: "#fff", color: "var(--color-text)", cursor: "pointer", fontFamily: "inherit" }}>Undo</button>
                          <button onClick={() => commitCustomTime(startH, startM, startP, endH, endM, endP)} style={{ flex: 2, padding: "8px 0", fontSize: 12, fontWeight: 600, border: "1px solid var(--color-primary)", borderRadius: 7, background: "var(--color-primary)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

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
                    onClick={() => onSelect("OFF", [], seriesId ? seriesScope : undefined)}
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
                    onClick={() => {
                      // Sync tab to the current shift's focus area
                      if (currentShiftCodeIds.length) {
                        const fa = shiftCodes.find((s) => s.id === currentShiftCodeIds[0])?.focusAreaId;
                        if (fa != null) setPickerTab(fa);
                      }
                      setShowPicker(true);
                    }}
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

              {/* Focus area tabs */}
              {allPickerAreas.length > 1 && (
                <div style={{
                  display: "flex",
                  borderBottom: "2px solid var(--color-border)",
                  marginBottom: 16,
                  marginLeft: -20,
                  marginRight: -20,
                  paddingLeft: 20,
                  paddingRight: 20,
                  gap: 0,
                }}>
                  {allPickerAreas.map((fa) => {
                    const isActive = pickerTab === fa.id;
                    return (
                      <button
                        key={fa.id}
                        onClick={() => setPickerTab(fa.id)}
                        style={{
                          flex: 1,
                          padding: "9px 8px",
                          border: "none",
                          borderBottom: isActive ? "2.5px solid var(--color-primary)" : "2.5px solid transparent",
                          background: isActive ? "var(--color-primary-light, rgba(59,130,246,0.08))" : "none",
                          color: isActive ? "var(--color-primary)" : "var(--color-text-subtle)",
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "color 100ms ease, background 100ms ease",
                          marginBottom: -2,
                          whiteSpace: "nowrap",
                          borderRadius: isActive ? "6px 6px 0 0" : 0,
                        }}
                      >
                        {fa.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Shifts for the active tab's focus area */}
              {(() => {
                const activeArea = allPickerAreas.find((fa) => fa.id === pickerTab);
                const areaName = activeArea?.name ?? allPickerAreas[0]?.name ?? "";
                const areaShifts = getShiftsForFocusArea(areaName);

                const boldHeading: React.CSSProperties = {
                  marginBottom: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                };

                return (
                  <>
                    {/* Focus area shifts — heading only shown when there's a single area (no tabs) */}
                    {areaShifts.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        {allPickerAreas.length <= 1 && <div style={boldHeading}>{areaName}</div>}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {areaShifts.map((s) => renderShiftButton(s))}
                        </div>
                      </div>
                    )}

                    {/* General shifts (non-off-day) */}
                    {generalNonOffShifts.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={boldHeading}>General</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {generalNonOffShifts.map((s) => renderShiftButton(s))}
                        </div>
                      </div>
                    )}

                    {/* Off Days */}
                    {offDayShifts.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={boldHeading}>Off Days</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {offDayShifts.map((s) => renderShiftButton(s))}
                        </div>
                      </div>
                    )}

                    {areaShifts.length === 0 && generalNonOffShifts.length === 0 && offDayShifts.length === 0 && (
                      <div
                        style={{
                          padding: "24px 16px",
                          textAlign: "center",
                          color: "var(--color-text-subtle)",
                          fontSize: 13,
                        }}
                      >
                        No shifts available.
                      </div>
                    )}
                  </>
                );
              })()}
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
