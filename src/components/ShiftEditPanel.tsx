"use client";

import { useState, useEffect } from "react";
import { formatDate, getCertName } from "@/lib/utils";
import { EditModalState, ShiftCode, NoteType, IndicatorType, SeriesScope, FocusArea, NamedItem, DraftKind } from "@/types";
import ShiftPicker from "./ShiftPicker";

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
  /** Published shift code IDs — used to identify newly added shifts in split-shift view */
  publishedShiftCodeIds?: number[];
  /** Draft classification for this cell — used to show NEW badge on single-shift pills */
  draftKind?: DraftKind;
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

// ── Color helper — darken a hex/rgb color for borders ─────────────────────
function darkenColor(color: string, amount = 0.25): string {
  // Handle hex
  const hex = color.replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = Math.max(0, Math.round(parseInt(hex.slice(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(hex.slice(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(hex.slice(4, 6), 16) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
  }
  // Fallback: just return the border color
  return color;
}

// ── Pipe-delimited per-sub-shift time helpers ─────────────────────────────
function parseMultiTimes(time: string | null | undefined, count: number): (string | null)[] {
  if (!time) return Array(count).fill(null);
  const parts = time.split('|');
  return Array.from({ length: count }, (_, i) => parts[i] || null);
}

function joinMultiTimes(times: (string | null)[]): string | null {
  if (times.every(t => !t)) return null;
  return times.map(t => t ?? '').join('|');
}

// ── Per-pill custom time editor (select dropdowns, immediate save) ────────
const HOURS = [1,2,3,4,5,6,7,8,9,10,11,12];
const MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"];
const pillSelStyle: React.CSSProperties = {
  padding: "5px 2px", border: "1.5px solid var(--color-border)", borderRadius: 6,
  fontSize: 12, fontWeight: 600, fontFamily: "inherit", background: "#fff",
  textAlign: "center", cursor: "pointer", outline: "none", boxSizing: "border-box",
};

function PillTimeEditor({
  customStart,
  customEnd,
  defaultStart,
  defaultEnd,
  onSave,
  onRemove,
}: {
  customStart: string | null;
  customEnd: string | null;
  defaultStart: string | null;
  defaultEnd: string | null;
  onSave: (start: string | null, end: string | null) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!!(customStart || customEnd));
  const s = parseTo12h(customStart);
  const e = parseTo12h(customEnd);

  function updateStart(hour: string, minute: string, period: "AM" | "PM") {
    onSave(to24h(hour, minute, period), customEnd);
  }
  function updateEnd(hour: string, minute: string, period: "AM" | "PM") {
    onSave(customStart, to24h(hour, minute, period));
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: 11,
          color: "var(--color-text-subtle)", background: "none",
          border: "1px dashed var(--color-border)", borderRadius: 7,
          padding: "6px 10px", cursor: "pointer", fontFamily: "inherit",
          width: "100%", justifyContent: "center", marginTop: 8,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Custom time
        {(defaultStart || defaultEnd) && <span style={{ opacity: 0.6 }}>· {[defaultStart ? fmt12h(defaultStart) : null, defaultEnd ? fmt12h(defaultEnd) : null].filter(Boolean).join(" – ")}</span>}
      </button>
    );
  }

  return (
    <div style={{ background: "#F8FAFC", border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Custom Time</span>
        <button
          onClick={() => { setExpanded(false); onRemove(); }}
          style={{ fontSize: 10, color: "var(--color-text-subtle)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >Remove</button>
      </div>

      {/* Start row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-subtle)", width: 36, flexShrink: 0 }}>START</span>
        <select value={s.hour} onChange={(ev) => updateStart(ev.target.value, s.minute, s.period)} style={{ ...pillSelStyle, width: 46 }}>
          <option value="">--</option>
          {HOURS.map((h) => <option key={h} value={String(h)}>{h}</option>)}
        </select>
        <span style={{ fontWeight: 700, color: "var(--color-text-muted)", fontSize: 12 }}>:</span>
        <select value={s.minute} onChange={(ev) => updateStart(s.hour, ev.target.value, s.period)} style={{ ...pillSelStyle, width: 46 }}>
          {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={s.period} onChange={(ev) => updateStart(s.hour, s.minute, ev.target.value as "AM" | "PM")} style={{ ...pillSelStyle, width: 50 }}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      {/* End row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-subtle)", width: 36, flexShrink: 0 }}>END</span>
        <select value={e.hour} onChange={(ev) => updateEnd(ev.target.value, e.minute, e.period)} style={{ ...pillSelStyle, width: 46 }}>
          <option value="">--</option>
          {HOURS.map((h) => <option key={h} value={String(h)}>{h}</option>)}
        </select>
        <span style={{ fontWeight: 700, color: "var(--color-text-muted)", fontSize: 12 }}>:</span>
        <select value={e.minute} onChange={(ev) => updateEnd(e.hour, ev.target.value, e.period)} style={{ ...pillSelStyle, width: 46 }}>
          {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={e.period} onChange={(ev) => updateEnd(e.hour, e.minute, ev.target.value as "AM" | "PM")} style={{ ...pillSelStyle, width: 50 }}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
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
  publishedShiftCodeIds = [],
  draftKind = null,
  focusAreas = [],
  certifications = [],
}: ShiftEditPanelProps) {
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("this");

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const [showPicker, setShowPicker] = useState(!hasActiveShift);

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

  const currentLabels = currentShift
    ? currentShift.split("/").filter((l) => l !== "OFF")
    : [];

  function getShiftCodeStyle(label: string, codeId?: number) {
    if (codeId != null) {
      const byId = shiftCodes.find((st) => st.id === codeId);
      if (byId) return byId;
    }
    return (
      shiftCodes.find((st) => st.label === label) ?? {
        color: "#F8FAFC",
        border: "#CBD5E1",
        text: "#475569",
      }
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
      const isCellNew = draftKind === 'new';
      const isCellModified = draftKind === 'modified';
      return (
        <div
          style={{
            background: s.color,
            border: isCellNew
              ? `2px dashed ${darkenColor(s.color, 0.35)}`
              : `1.5px solid ${darkenColor(s.color, 0.25)}`,
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
          {(isCellNew || isCellModified) && (
            <span
              style={{
                position: "absolute",
                top: -10,
                left: 12,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.05em",
                background: isCellNew ? "#16A34A" : "#D97706",
                color: "#fff",
                borderRadius: 4,
                padding: "3px 8px",
                lineHeight: 1,
                pointerEvents: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              }}
            >
              {isCellNew ? "NEW" : "EDITED"}
            </span>
          )}
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

    // Multi-shift: individual stacked cards, each with its own details & indicators
    return (
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {currentLabels.map((label, i) => {
          const s = getShiftCodeStyle(label, currentShiftCodeIds[i]);
          const fullName = (s as ShiftCode).name && (s as ShiftCode).name !== label ? (s as ShiftCode).name : null;
          const shiftCode = currentShiftCodeIds[i] != null
            ? shiftCodes.find((st) => st.id === currentShiftCodeIds[i])
            : shiftCodes.find((st) => st.label === label);
          const shiftFaId = shiftCode?.focusAreaId;
          const shiftWingId = shiftFaId ?? activeTab;
          const pillNoteTypes = getNoteTypes ? getNoteTypes(shiftWingId) : [];
          const isNewPill = draftKind === 'new'
            || (publishedShiftCodeIds.length > 0 && !publishedShiftCodeIds.includes(currentShiftCodeIds[i]));
          const isModifiedPill = draftKind === 'modified' && !isNewPill;
          const faName = shiftCode?.focusAreaId != null
            ? focusAreas.find(fa => fa.id === shiftCode.focusAreaId)?.name
            : undefined;
          const defaultStart = shiftCode?.defaultStartTime ?? null;
          const defaultEnd = shiftCode?.defaultEndTime ?? null;
          return (
            <div
              key={label + i}
              style={{
                border: isNewPill
                  ? `2px dashed ${darkenColor(s.color, 0.35)}`
                  : `1.5px solid ${darkenColor(s.color, 0.25)}`,
                borderRadius: 12,
                overflow: "visible",
                position: "relative",
              }}
            >
              {/* NEW / EDITED badge */}
              {(isNewPill || isModifiedPill) && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    left: 12,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    background: isNewPill ? "#16A34A" : "#D97706",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "3px 8px",
                    lineHeight: 1,
                    pointerEvents: "none",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    zIndex: 2,
                  }}
                >
                  {isNewPill ? "NEW" : "EDITED"}
                </span>
              )}
              {/* Pill header */}
              <div
                style={{
                  background: s.color,
                  borderBottom: `1px solid ${darkenColor(s.color, 0.2)}`,
                  height: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "10px 10px 0 0",
                  position: "relative",
                  gap: 2,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontWeight: 800, fontSize: 18, color: s.text, lineHeight: 1 }}>
                    {label}
                  </span>
                  {(fullName || faName) && (
                    <div style={{ fontSize: 10, color: s.text, opacity: 0.65, lineHeight: 1, marginTop: 3 }}>
                      {fullName}{fullName && faName ? " · " : ""}{faName}
                    </div>
                  )}
                </div>
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
                      right: 8,
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
                {/* Note dots — left side to avoid × button */}
                {renderNoteDots(pillNoteTypes, "left")}
              </div>
              {/* Card body: default time, per-pill custom time editor, + indicators */}
              <div style={{ padding: "10px 12px", background: "#fff", borderRadius: "0 0 10px 10px" }}>
                {/* Default time info */}
                {(defaultStart || defaultEnd) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "var(--color-text-subtle)",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span style={{ fontWeight: 500 }}>
                      {[defaultStart ? fmt12h(defaultStart) : null, defaultEnd ? fmt12h(defaultEnd) : null].filter(Boolean).join(" – ")}
                    </span>
                  </div>
                )}
                {/* Per-pill custom time editor */}
                {allowShiftEdits && onCustomTimeChange && (() => {
                  const pillStarts = parseMultiTimes(customStartTime, currentLabels.length);
                  const pillEnds = parseMultiTimes(customEndTime, currentLabels.length);
                  return (
                    <PillTimeEditor
                      customStart={pillStarts[i]}
                      customEnd={pillEnds[i]}
                      defaultStart={defaultStart}
                      defaultEnd={defaultEnd}
                      onSave={(start, end) => {
                        const newStarts = [...pillStarts];
                        const newEnds = [...pillEnds];
                        newStarts[i] = start;
                        newEnds[i] = end;
                        onCustomTimeChange(joinMultiTimes(newStarts), joinMultiTimes(newEnds));
                      }}
                      onRemove={() => {
                        const newStarts = [...pillStarts];
                        const newEnds = [...pillEnds];
                        newStarts[i] = null;
                        newEnds[i] = null;
                        onCustomTimeChange(joinMultiTimes(newStarts), joinMultiTimes(newEnds));
                      }}
                    />
                  );
                })()}
                {/* Inline indicators for this shift's focus area */}
                {renderInlineIndicators(shiftWingId)}
              </div>
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
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {inDetailMode ? (
            // ── Detail mode ──────────────────────────────────────────────────
            <>
              {/* Current shift displayed prominently */}
              {renderCurrentShiftPill()}

              {/* Custom time override — single-shift only (multi-shift has per-pill editors) */}
              {hasActiveShift && allowShiftEdits && onCustomTimeChange && currentLabels.length <= 1 && (() => {
                const matchedCode = shiftCodes.find(st => st.label === currentLabels[0]);
                return (
                  <div style={{ marginBottom: 16 }}>
                    <PillTimeEditor
                      customStart={customStartTime ?? null}
                      customEnd={customEndTime ?? null}
                      defaultStart={matchedCode?.defaultStartTime ?? null}
                      defaultEnd={matchedCode?.defaultEndTime ?? null}
                      onSave={(start, end) => onCustomTimeChange(start, end)}
                      onRemove={() => onCustomTimeChange(null, null)}
                    />
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

              {/* Make repeating — disabled for split shifts (max 1 code) */}
              {allowShiftEdits && hasActiveShift && !seriesId && onMakeRepeating && currentLabels.length <= 1 && (
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

              {/* Add another shift — hidden when at max (2) */}
              {allowShiftEdits && currentLabels.length < 2 && (
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

              {/* Shift Picker Component */}
              <ShiftPicker
                shiftCodes={shiftCodes}
                focusAreas={focusAreas}
                currentShiftCodeIds={currentShiftCodeIds}
                onSelect={(label, ids) => {
                  onSelect(label, ids, seriesId ? seriesScope : undefined);
                  if (label !== "OFF") setShowPicker(false);
                }}
                empFocusAreaIds={modal.empFocusAreaIds}
                empCertificationId={modal.empCertificationId}
                initialTab={modal.activeFocusAreaId}
                multiSelect={true}
                closeOnSelect={false}
              />
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
              Confirm
            </button>
          </div>
        )}
      </div>
    </>
  );
}
