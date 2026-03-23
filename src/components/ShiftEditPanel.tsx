"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatDate, getCertName, formatRelativeTime } from "@/lib/utils";
import { EditModalState, ShiftCode, IndicatorType, SeriesScope, SeriesFrequency, FocusArea, NamedItem, DraftKind } from "@/types";
import ShiftPicker from "./ShiftPicker";
import ConfirmDialog from "./ConfirmDialog";
import RepeatForm from "./RepeatForm";
import { useMediaQuery, MOBILE } from "@/hooks";

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
  getActiveIndicatorIds?: (focusAreaId: number) => number[];
  onNoteToggle?: (indicatorTypeId: number, active: boolean, focusAreaId: number) => void;
  /** Series ID if the current shift belongs to a repeating series */
  seriesId?: string | null;
  /** Called when the user confirms creating a repeating shift */
  onRepeatConfirm?: (
    frequency: SeriesFrequency,
    daysOfWeek: number[] | null,
    startDate: string,
    endDate: string | null,
    maxOccurrences: number | null,
  ) => void;
  /** Employee ID — needed for repeat form overwrite checks */
  empId?: string;
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
  /** Audit metadata — only populated for admin+ users. */
  auditInfo?: {
    createdByName: string | null;
    updatedByName: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  /** True if this shift belongs to the currently logged-in employee. */
  isOwnShift?: boolean;
  /** True if there's already an active request for this shift. */
  hasActiveRequest?: boolean;
  /** Callback to post this shift as available for pickup. */
  onMakeAvailable?: () => void;
  /** Callback to open the swap proposal modal. */
  onProposeSwap?: () => void;
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

// ── Per-pill custom time editor (custom dropdown views, immediate save) ───
const HOURS = [1,2,3,4,5,6,7,8,9,10,11,12];
const MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"];

const triggerStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1.5px solid var(--color-border)",
  borderRadius: 8,
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 600,
  fontFamily: "inherit",
  background: "var(--color-surface)",
  textAlign: "center",
  cursor: "pointer",
  outline: "none",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  userSelect: "none",
  position: "relative",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: "50%",
  transform: "translateX(-50%)",
  background: "var(--color-surface)",
  border: "1.5px solid var(--color-border)",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  zIndex: 100,
  maxHeight: 180,
  overflowY: "auto",
  overflowX: "hidden",
  minWidth: 52,
};

const optionStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "center",
  whiteSpace: "nowrap",
};

function TimeDropdown({
  value,
  options,
  onChange,
  width,
  placeholder,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  width: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  const display = value || placeholder || "--";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ ...triggerStyle, width, color: value ? "inherit" : "var(--color-text-muted)" }}
      >
        {display}
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 1, flexShrink: 0 }}>
          <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={dropdownStyle}>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); close(); }}
              style={{
                ...optionStyle,
                background: opt.value === value ? "var(--color-info-bg)" : "transparent",
                color: opt.value === value ? "var(--color-accent-text)" : "var(--color-text-primary)",
                fontWeight: opt.value === value ? 700 : 500,
              }}
              onMouseEnter={(e) => { if (opt.value !== value) (e.currentTarget.style.background = "var(--color-bg)"); }}
              onMouseLeave={(e) => { if (opt.value !== value) (e.currentTarget.style.background = "transparent"); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const hourOptions = [
  { value: "", label: "--" },
  ...HOURS.map((h) => ({ value: String(h), label: String(h) })),
];
const minuteOptions = MINUTES.map((m) => ({ value: m, label: m }));
const periodOptions = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

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

  // Validate start < end when both are set
  const hasTimeError = !!(customStart && customEnd && customStart >= customEnd);

  function updateStart(hour: string, minute: string, period: "AM" | "PM") {
    const newStart = to24h(hour, minute, period);
    if (newStart && customEnd && newStart >= customEnd) {
      // Still save to show the error — user can fix end time next
    }
    onSave(newStart, customEnd);
  }
  function updateEnd(hour: string, minute: string, period: "AM" | "PM") {
    const newEnd = to24h(hour, minute, period);
    if (customStart && newEnd && customStart >= newEnd) {
      // Still save to show the error — user can fix start time next
    }
    onSave(customStart, newEnd);
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: "var(--dg-fs-footnote)",
          color: "var(--color-text-subtle)", background: "none",
          border: "1px dashed var(--color-border)", borderRadius: 8,
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
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Custom Time</span>
        <button
          onClick={() => { setExpanded(false); onRemove(); }}
          style={{ fontSize: "var(--dg-fs-badge)", color: "var(--color-text-subtle)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >Remove</button>
      </div>

      {/* Start row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color: "var(--color-text-subtle)", width: 36, flexShrink: 0 }}>START</span>
        <TimeDropdown value={s.hour} options={hourOptions} onChange={(v) => updateStart(v, s.minute, s.period)} width={50} placeholder="--" />
        <span style={{ fontWeight: 700, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>:</span>
        <TimeDropdown value={s.minute} options={minuteOptions} onChange={(v) => updateStart(s.hour, v, s.period)} width={50} />
        <TimeDropdown value={s.period} options={periodOptions} onChange={(v) => updateStart(s.hour, s.minute, v as "AM" | "PM")} width={54} />
      </div>

      {/* End row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color: "var(--color-text-subtle)", width: 36, flexShrink: 0 }}>END</span>
        <TimeDropdown value={e.hour} options={hourOptions} onChange={(v) => updateEnd(v, e.minute, e.period)} width={50} placeholder="--" />
        <span style={{ fontWeight: 700, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>:</span>
        <TimeDropdown value={e.minute} options={minuteOptions} onChange={(v) => updateEnd(e.hour, v, e.period)} width={50} />
        <TimeDropdown value={e.period} options={periodOptions} onChange={(v) => updateEnd(e.hour, e.minute, v as "AM" | "PM")} width={54} />
      </div>

      {hasTimeError && (
        <div style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-badge)", fontWeight: 600, marginTop: 6 }}>
          Start time must be before end time
        </div>
      )}
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
  getActiveIndicatorIds,
  onNoteToggle,
  seriesId,
  onRepeatConfirm,
  empId,
  customStartTime,
  customEndTime,
  onCustomTimeChange,
  publishedShiftCodeIds = [],
  draftKind = null,
  focusAreas = [],
  certifications = [],
  auditInfo,
  isOwnShift = false,
  hasActiveRequest = false,
  onMakeAvailable,
  onProposeSwap,
}: ShiftEditPanelProps) {
  const isMobile = useMediaQuery(MOBILE);
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("this");
  const [pendingDelete, setPendingDelete] = useState<{ type: "all" } | { type: "pill"; index: number } | null>(null);

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const [showPicker, setShowPicker] = useState(!hasActiveShift);
  const [showRepeatForm, setShowRepeatForm] = useState(false);

  // Capture initial state at mount so Cancel can revert
  const [initialShift] = useState(() => currentShift);
  const [initialShiftCodeIds] = useState(() => [...currentShiftCodeIds]);
  const [initialNotesByFocusArea] = useState<Record<number, number[]>>(() => {
    if (!getActiveIndicatorIds) return {};
    const focusAreaIds = new Set<number>(modal.empFocusAreaIds);
    for (const st of shiftCodes) {
      if (st.focusAreaId != null) focusAreaIds.add(st.focusAreaId);
    }
    const record: Record<number, number[]> = {};
    for (const faId of focusAreaIds) {
      record[faId] = [...getActiveIndicatorIds(faId)];
    }
    return record;
  });

  // Derive whether any edits have been made since panel opened
  const hasShiftEdit = currentShift !== initialShift;
  const hasNoteEdit = (() => {
    if (!getActiveIndicatorIds) return false;
    for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
      const curTypes = getActiveIndicatorIds(Number(faIdStr));
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
    if (getActiveIndicatorIds) {
      for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
        const faId = Number(faIdStr);
        const curTypes = getActiveIndicatorIds(faId);
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
        color: "var(--color-bg)",
        border: "var(--color-border)",
        text: "var(--color-text-muted)",
      }
    );
  }


  const sectionLabel: React.CSSProperties = {
    marginBottom: 8,
    fontSize: "var(--dg-fs-badge)",
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };


  function renderNoteDots(activeIds: number[], side: "left" | "right" = "right") {
    if (activeIds.length === 0) return null;
    const activeDots = indicatorTypes.filter((ind) => activeIds.includes(ind.id));
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
    const noteTypes = getActiveIndicatorIds ? getActiveIndicatorIds(activeTab) : [];

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
                fontSize: "var(--dg-fs-badge)",
                fontWeight: 800,
                letterSpacing: "0.05em",
                background: isCellNew ? "var(--color-success-text)" : "var(--color-warning)",
                color: "var(--color-text-inverse)",
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
          <span style={{ fontWeight: 800, fontSize: "var(--dg-fs-card-title)", color: s.text, lineHeight: 1 }}>
            {label}
          </span>
          {(fullName || faName) && (
            <span style={{ fontSize: "var(--dg-fs-footnote)", color: s.text, opacity: 0.7, lineHeight: 1 }}>
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
          const pillNoteTypes = getActiveIndicatorIds ? getActiveIndicatorIds(shiftWingId) : [];
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
                    fontSize: "var(--dg-fs-badge)",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    background: isNewPill ? "var(--color-success-text)" : "var(--color-warning)",
                    color: "var(--color-text-inverse)",
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
                  <span style={{ fontWeight: 800, fontSize: "var(--dg-fs-heading)", color: s.text, lineHeight: 1 }}>
                    {label}
                  </span>
                  {(fullName || faName) && (
                    <div style={{ fontSize: "var(--dg-fs-badge)", color: s.text, opacity: 0.65, lineHeight: 1, marginTop: 3 }}>
                      {fullName}{fullName && faName ? " · " : ""}{faName}
                    </div>
                  )}
                </div>
                {/* Per-pill remove button */}
                {allowShiftEdits && (
                  <button
                    onClick={() => setPendingDelete({ type: "pill", index: i })}
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
                      fontSize: "var(--dg-fs-body)",
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
              <div style={{ padding: "10px 12px", background: "var(--color-surface)", borderRadius: "0 0 10px 10px" }}>
                {/* Default time info */}
                {(defaultStart || defaultEnd) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "var(--dg-fs-footnote)",
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
        {indicatorTypes.map(({ id, name, color }) => {
          const isActive = getActiveIndicatorIds ? getActiveIndicatorIds(focusAreaId).includes(id) : false;
          return (
            <button
              key={id}
              onClick={() => onNoteToggle?.(id, !isActive, focusAreaId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                border: `1.5px solid ${isActive ? color : "var(--color-border)"}`,
                borderRadius: 20,
                background: isActive ? `${color}18` : "var(--color-surface)",
                cursor: "pointer",
                fontSize: "var(--dg-fs-footnote)",
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
          {indicatorTypes.map(({ id, name, color }) => {
            const isActive = getActiveIndicatorIds ? getActiveIndicatorIds(activeTab).includes(id) : false;
            return (
              <button
                key={id}
                onClick={() => onNoteToggle?.(id, !isActive, activeTab)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: `1.5px solid ${isActive ? color : "var(--color-border)"}`,
                  borderRadius: 8,
                  background: isActive ? `${color}18` : "var(--color-surface)",
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
                  <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: isActive ? color : "var(--color-text-secondary)" }}>
                    {name}
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-badge)", color: "var(--color-text-subtle)", marginTop: 1 }}>
                    Appears as a colored dot
                  </div>
                </div>
                {isActive && (
                  <div style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color, flexShrink: 0 }}>ON</div>
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
      <div
        className="dg-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Edit shift"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--color-surface)",
          }}
        >
          {isMobile && (
            <button
              onClick={onClose}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
              }}
            >
              {modal.empName}
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
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
          {!isMobile && (
            <button
              onClick={onClose}
              className="dg-btn dg-btn-ghost"
              style={{
                border: "1px solid var(--color-border)",
                padding: "4px 8px",
                fontSize: "var(--dg-fs-body)",
                lineHeight: 1,
              }}
              title="Close"
            >
              ×
            </button>
          )}
        </div>


        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "20px 24px" }}>
          {showRepeatForm && onRepeatConfirm && empId ? (
            // ── Repeat form mode ─────────────────────────────────────────────
            <RepeatForm
              empId={empId}
              shiftLabel={currentLabels[0] ?? ""}
              shiftCodeId={currentShiftCodeIds[0] ?? 0}
              startDate={modal.date}
              shiftCodes={shiftCodes}
              onConfirm={onRepeatConfirm}
              onBack={() => setShowRepeatForm(false)}
            />
          ) : inDetailMode ? (
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
                    fontSize: "var(--dg-fs-label)",
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
                    background: "var(--color-warning-bg)",
                    border: "1px solid var(--color-warning-border)",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      ...sectionLabel,
                      marginBottom: 6,
                      color: "var(--color-warning-text)",
                    }}
                  >
                    Repeating shift — edit scope
                  </div>
                  <div className="dg-segment" style={{ display: "flex" }}>
                    <button
                      onClick={() => setSeriesScope("this")}
                      className={`dg-segment-btn${seriesScope === "this" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: "var(--dg-fs-footnote)" }}
                    >
                      This shift
                    </button>
                    <button
                      onClick={() => setSeriesScope("all")}
                      className={`dg-segment-btn${seriesScope === "all" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: "var(--dg-fs-footnote)" }}
                    >
                      All in series
                    </button>
                  </div>
                </div>
              )}

              {/* Make repeating — disabled for split shifts (max 1 code) */}
              {allowShiftEdits && hasActiveShift && !seriesId && onRepeatConfirm && currentLabels.length <= 1 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionLabel}>Repeating</div>
                  <button
                    onClick={() => setShowRepeatForm(true)}
                    className="dg-btn dg-btn-secondary"
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontSize: "var(--dg-fs-caption)",
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

              {/* Audit metadata footer — admin+ only */}
              {auditInfo && (auditInfo.createdByName || auditInfo.updatedByName) && (
                <div
                  style={{
                    marginTop: 20,
                    paddingTop: 12,
                    borderTop: "1px solid var(--color-border)",
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-text-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {auditInfo.createdByName && auditInfo.createdAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Created by</span>
                      <span>{auditInfo.createdByName}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {formatRelativeTime(auditInfo.createdAt)}
                      </span>
                    </div>
                  )}
                  {auditInfo.updatedByName && auditInfo.updatedAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Updated by</span>
                      <span>{auditInfo.updatedByName}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {formatRelativeTime(auditInfo.updatedAt)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Remove shift */}
              {allowShiftEdits && hasActiveShift && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => setPendingDelete({ type: "all" })}
                    className="dg-btn dg-btn-danger"
                    style={{
                      width: "100%",
                      fontSize: "var(--dg-fs-caption)",
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
                      fontSize: "var(--dg-fs-caption)",
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

              {/* ── Shift Request Actions (employee self-service) ─────────── */}
              {isOwnShift && hasActiveShift && !hasActiveRequest && !hasEdits && (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: "1px solid var(--color-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--color-text-subtle)",
                      marginBottom: 2,
                    }}
                  >
                    Shift requests
                  </div>
                  {onMakeAvailable && (
                    <button
                      onClick={onMakeAvailable}
                      className="dg-btn dg-btn-ghost"
                      style={{
                        width: "100%",
                        fontSize: "var(--dg-fs-caption)",
                        padding: "9px 12px",
                        border: "1px solid var(--color-info-border)",
                        borderRadius: 8,
                        color: "var(--color-link)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                      Make available for pickup
                    </button>
                  )}
                  {onProposeSwap && (
                    <button
                      onClick={onProposeSwap}
                      className="dg-btn dg-btn-ghost"
                      style={{
                        width: "100%",
                        fontSize: "var(--dg-fs-caption)",
                        padding: "9px 12px",
                        border: "1px solid var(--color-info-border)",
                        borderRadius: 8,
                        color: "var(--color-accent-text)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      Propose a swap
                    </button>
                  )}
                </div>
              )}
              {isOwnShift && hasActiveRequest && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 12px",
                    background: "var(--color-warning-bg)",
                    borderRadius: 8,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--color-warning-text)",
                    textAlign: "center",
                  }}
                >
                  A request is already active for this shift
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
                    fontSize: "var(--dg-fs-caption)",
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
              background: "var(--color-surface)",
            }}
          >
            <button
              onClick={handleUndo}
              className="dg-btn dg-btn-ghost"
              style={{
                flex: 1,
                fontSize: "var(--dg-fs-caption)",
                padding: "9px 12px",
                border: "1px solid var(--color-border)",
              }}
            >
              Undo
            </button>
            <button
              onClick={onClose}
              className="dg-btn dg-btn-primary"
              style={{ flex: 1, fontSize: "var(--dg-fs-caption)", padding: "9px 12px" }}
            >
              Confirm
            </button>
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {pendingDelete && (
        <ConfirmDialog
          title={
            pendingDelete.type === "all" && currentLabels.length > 1
              ? "Remove All Shifts?"
              : "Remove Shift?"
          }
          message={
            pendingDelete.type === "pill"
              ? `Remove "${currentLabels[pendingDelete.index]}" from ${modal.empName} on ${formatDate(modal.date)}?`
              : currentLabels.length > 1
                ? `Remove all shifts (${currentLabels.join(", ")}) from ${modal.empName} on ${formatDate(modal.date)}?`
                : `Remove "${currentLabels[0]}" from ${modal.empName} on ${formatDate(modal.date)}?`
          }
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            if (pendingDelete.type === "all") {
              onSelect("OFF", [], seriesId ? seriesScope : undefined);
              if (onCustomTimeChange) onCustomTimeChange(null, null);
            } else {
              const removedIdx = pendingDelete.index;
              const remainingIds = currentShiftCodeIds.filter((_, j) => j !== removedIdx);
              const remainingLabels = remainingIds
                .map(id => shiftCodes.find(sc => sc.id === id)?.label)
                .filter((l): l is string => l != null);
              onSelect(
                remainingLabels.length > 0 ? remainingLabels.join("/") : "OFF",
                remainingIds,
                seriesId ? seriesScope : undefined,
              );
              // Realign pipe-delimited custom times by removing the deleted pill's entry
              if (onCustomTimeChange) {
                const pillStarts = parseMultiTimes(customStartTime, currentShiftCodeIds.length);
                const pillEnds = parseMultiTimes(customEndTime, currentShiftCodeIds.length);
                pillStarts.splice(removedIdx, 1);
                pillEnds.splice(removedIdx, 1);
                onCustomTimeChange(joinMultiTimes(pillStarts), joinMultiTimes(pillEnds));
              }
            }
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
