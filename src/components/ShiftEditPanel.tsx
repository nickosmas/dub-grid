"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatDate, getCertName, formatRelativeTime, calcTimeDuration } from "@/lib/utils";
import { EditModalState, ShiftCode, ShiftCategory, AbsenceType, IndicatorType, SeriesScope, SeriesFrequency, FocusArea, NamedItem, DraftKind } from "@/types";
import ShiftPicker from "./ShiftPicker";
import ConfirmDialog from "./ConfirmDialog";
import RepeatForm from "./RepeatForm";
import { useMediaQuery, MOBILE } from "@/hooks";

interface ShiftEditPanelProps {
  modal: EditModalState;
  currentShift: string | null;
  currentShiftCodeIds?: number[];
  shiftCodes: ShiftCode[];
  /** Shift categories — used to compute time bounds for custom time validation. */
  shiftCategories?: ShiftCategory[];
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
  /** Available absence types for off-day selection. */
  absenceTypes?: AbsenceType[];
  /** Called when user selects an absence type (off day). */
  onAbsenceSelect?: (absenceType: AbsenceType) => void;
  /** Currently active absence type ID on this cell. */
  currentAbsenceTypeId?: number | null;
  /** Cross-date overlap warnings to display (non-blocking). */
  overlapWarnings?: string[];
}

// ── Time helpers ────────────────────────────────────────────────────────────
function parseTo12h(time24: string | null | undefined): { hour: string; minute: string; period: "AM" | "PM" } {
  if (!time24) return { hour: "", minute: "00", period: "AM" };
  // Handle pipe-delimited multi-shift times — use first segment
  const seg = time24.split("|")[0];
  if (!seg) return { hour: "", minute: "00", period: "AM" };
  const [h, m] = seg.split(":").map(Number);
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

/** Normalize a time string to HH:MM (DB TIME columns may include seconds). */
function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

/** True if start→end is a valid time range. Overnight shifts (end ≤ start) are valid for scheduling. */
function isValidTimeOrder(start: string, end: string): boolean {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  // Only invalid if start and end are identical (zero-duration shift)
  return s !== e;
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
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
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  zIndex: 100,
  maxHeight: 180,
  overflowY: "auto",
  overflowX: "hidden",
  minWidth: 52,
  padding: 4,
  scrollbarWidth: "none",
};

const optionStyle: React.CSSProperties = {
  padding: "9px 14px",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "center",
  whiteSpace: "nowrap",
  borderRadius: 8,
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
                background: opt.value === value ? "var(--color-border-light)" : "transparent",
                color: opt.value === value ? "var(--color-text-primary)" : "var(--color-text-primary)",
                fontWeight: opt.value === value ? 700 : 500,
              }}
              onMouseEnter={(e) => { if (opt.value !== value) (e.currentTarget.style.background = "var(--color-bg-secondary)"); }}
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

/** Subtract one hour from HH:MM string, clamped to 00:00. */
function subtractOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.max(0, h - 1);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Add one hour to HH:MM string, clamped to 23:59. */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(23, h + 1);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function PillTimeEditor({
  customStart,
  customEnd,
  defaultStart,
  defaultEnd,
  minTime,
  maxTime,
  onSave,
  onRemove,
}: {
  customStart: string | null;
  customEnd: string | null;
  defaultStart: string | null;
  defaultEnd: string | null;
  /** Earliest allowed start time (HH:MM). */
  minTime?: string | null;
  /** Latest allowed end time (HH:MM). */
  maxTime?: string | null;
  onSave: (start: string | null, end: string | null) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!!(customStart || customEnd));

  // Local state for intermediate edits (needed because an individual dropdown change
  // may create a temporarily invalid state while the user adjusts other fields).
  // Pre-populate with defaults when no custom times exist so the user starts from a known value.
  const [localStart, setLocalStart] = useState<string | null>(customStart ?? defaultStart);
  const [localEnd, setLocalEnd] = useState<string | null>(customEnd ?? defaultEnd);

  // Re-sync local state when parent props change (e.g. after undo or external update)
  const prevStartRef = useRef(customStart);
  const prevEndRef = useRef(customEnd);
  if (customStart !== prevStartRef.current || customEnd !== prevEndRef.current) {
    prevStartRef.current = customStart;
    prevEndRef.current = customEnd;
    setLocalStart(customStart ?? defaultStart);
    setLocalEnd(customEnd ?? defaultEnd);
  }

  const s = parseTo12h(localStart);
  const e = parseTo12h(localEnd);

  // Validation — normalize all times before comparison (DB TIME columns include seconds)
  const nStart = localStart ? normalizeTime(localStart) : null;
  const nEnd = localEnd ? normalizeTime(localEnd) : null;
  const nMin = minTime ? normalizeTime(minTime) : null;
  const nMax = maxTime ? normalizeTime(maxTime) : null;

  const hasTimeError = !!(nStart && nEnd && !isValidTimeOrder(nStart, nEnd));
  const isOvernightBounds = !!(nMin && nMax && nMax < nMin);
  const isStartTooEarly = !!(nMin && nStart && nStart < nMin);
  const isEndTooLate = !!(nMax && nEnd && !isOvernightBounds && nEnd > nMax);

  // Auto-save: when a dropdown changes and the result is valid, persist immediately
  function tryAutoSave(newStart: string | null, newEnd: string | null) {
    const ns = newStart ? normalizeTime(newStart) : null;
    const ne = newEnd ? normalizeTime(newEnd) : null;
    const orderOk = !(ns && ne && !isValidTimeOrder(ns, ne));
    const startOk = !(nMin && ns && ns < nMin);
    const endOk = !(nMax && ne && !isOvernightBounds && ne > nMax);
    if (orderOk && startOk && endOk) {
      onSave(newStart, newEnd);
    }
  }

  function updateStart(hour: string, minute: string, period: "AM" | "PM") {
    const newStart = to24h(hour, minute, period);
    setLocalStart(newStart);
    tryAutoSave(newStart, localEnd);
  }
  function updateEnd(hour: string, minute: string, period: "AM" | "PM") {
    const newEnd = to24h(hour, minute, period);
    setLocalEnd(newEnd);
    tryAutoSave(localStart, newEnd);
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
        {(defaultStart || defaultEnd) && <span style={{ opacity: 0.6 }}>· {[defaultStart ? fmt12h(defaultStart) : null, defaultEnd ? fmt12h(defaultEnd) : null].filter(Boolean).join(" – ")}{calcTimeDuration(defaultStart, defaultEnd) ? ` (${calcTimeDuration(defaultStart, defaultEnd)})` : ""}</span>}
      </button>
    );
  }

  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Custom Time</span>
        <button
          onClick={() => { onRemove(); setExpanded(false); }}
          style={{ fontSize: "var(--dg-fs-badge)", color: "var(--color-danger)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: 600 }}
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

      {/* Duration display */}
      {calcTimeDuration(localStart, localEnd) && !hasTimeError && (
        <div style={{ fontSize: "var(--dg-fs-badge)", color: "var(--color-text-muted)", marginTop: 8, fontWeight: 600 }}>
          Duration: <span style={{ color: "var(--color-text-secondary)" }}>{calcTimeDuration(localStart, localEnd)}</span>
        </div>
      )}

      {/* Validation errors */}
      {hasTimeError && (
        <div style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-badge)", fontWeight: 600, marginTop: 6 }}>
          Start and end time cannot be the same
        </div>
      )}
      {isStartTooEarly && minTime && (
        <div style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-badge)", fontWeight: 600, marginTop: 6 }}>
          Start cannot be before {fmt12h(minTime)}
        </div>
      )}
      {isEndTooLate && maxTime && (
        <div style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-badge)", fontWeight: 600, marginTop: 6 }}>
          End cannot be after {fmt12h(maxTime)}
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
  shiftCategories = [],
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
  absenceTypes = [],
  onAbsenceSelect,
  currentAbsenceTypeId,
  overlapWarnings = [],
}: ShiftEditPanelProps) {
  const isMobile = useMediaQuery(MOBILE);
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("this");
  const [pendingDelete, setPendingDelete] = useState<{ type: "all" } | { type: "pill"; index: number } | null>(null);

  const hasActiveShift = !!(currentShift && currentShift !== "OFF");
  const isAbsence = currentAbsenceTypeId != null;
  const [showPicker, setShowPicker] = useState(!hasActiveShift);
  const [showRepeatForm, setShowRepeatForm] = useState(false);

  // Capture initial state at mount so Cancel can revert
  const [initialShift] = useState(() => currentShift);
  const [initialShiftCodeIds] = useState(() => [...currentShiftCodeIds]);
  const [initialAbsenceTypeId] = useState(() => currentAbsenceTypeId ?? null);
  const [initialCustomStartTime] = useState(() => customStartTime ?? null);
  const [initialCustomEndTime] = useState(() => customEndTime ?? null);
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
  const hasShiftEdit = currentShift !== initialShift || (currentAbsenceTypeId ?? null) !== initialAbsenceTypeId;
  const hasTimeEdit = (customStartTime ?? null) !== initialCustomStartTime
    || (customEndTime ?? null) !== initialCustomEndTime;
  const hasNoteEdit = (() => {
    if (!getActiveIndicatorIds) return false;
    for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
      const curTypes = getActiveIndicatorIds(Number(faIdStr));
      if (curTypes.length !== initTypes.length) return true;
      if (curTypes.some((t) => !initTypes.includes(t))) return true;
    }
    return false;
  })();
  const hasEdits = hasShiftEdit || hasNoteEdit || hasTimeEdit;

  // Build concise change descriptions for the footer summary
  function describeShiftChange(): string | null {
    if (!hasShiftEdit) return null;

    // Absence type changed — no per-pill detail needed
    if ((currentAbsenceTypeId ?? null) !== initialAbsenceTypeId) {
      const resolveLabel = (shift: string | null, absId: number | null): string | null => {
        if (absId != null) {
          const at = absenceTypes.find(a => a.id === absId);
          return at ? `${at.name} (${at.label})` : null;
        }
        return shift && shift !== "OFF" ? shift : null;
      };
      const from = resolveLabel(initialShift, initialAbsenceTypeId);
      const to = resolveLabel(currentShift, currentAbsenceTypeId ?? null);
      if (!from && to) return `Shift: added ${to}`;
      if (from && !to) return `Shift: ${from} removed`;
      if (from && to) return `Shift: ${from} \u2192 ${to}`;
      return null;
    }

    const codeLabel = (id: number): string =>
      shiftCodes.find(s => s.id === id)?.label ?? '?';

    const initIds = initialShiftCodeIds;
    const curIds = currentShiftCodeIds;

    // Single pill
    if (initIds.length <= 1 && curIds.length <= 1) {
      const from = initIds[0] != null ? codeLabel(initIds[0]) : null;
      const to = curIds[0] != null ? codeLabel(curIds[0]) : null;
      if (!from && to) return `Shift: added ${to}`;
      if (from && !to) return `Shift: ${from} removed`;
      if (from && to && initIds[0] !== curIds[0]) return `Shift: ${from} \u2192 ${to}`;
      return null;
    }

    // Multi-pill: per-pill detail
    const maxLen = Math.max(initIds.length, curIds.length);
    const parts: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      const fromId = initIds[i];
      const toId = curIds[i];
      const from = fromId != null ? codeLabel(fromId) : null;
      const to = toId != null ? codeLabel(toId) : null;
      if (fromId === toId) continue;
      if (!from && to) parts.push(`added ${to}`);
      else if (from && !to) parts.push(`removed ${from}`);
      else if (from && to) parts.push(`${from} \u2192 ${to}`);
    }
    return parts.length > 0 ? `Shift: ${parts.join(", ")}` : null;
  }

  function describeTimeChange(): string | null {
    if (!hasTimeEdit) return null;

    const pillCount = currentShiftCodeIds.length;
    const codeLabel = (id: number): string =>
      shiftCodes.find(s => s.id === id)?.label ?? '?';

    // Single pill
    if (pillCount <= 1) {
      const hadTime = initialCustomStartTime != null || initialCustomEndTime != null;
      const hasTime = (customStartTime ?? null) != null || (customEndTime ?? null) != null;
      if (!hadTime && hasTime) {
        return `Time: added ${fmt12h(customStartTime)} \u2013 ${fmt12h(customEndTime)}`;
      }
      if (hadTime && !hasTime) return "Time: removed custom time";
      return `Time: ${fmt12h(initialCustomStartTime)} \u2013 ${fmt12h(initialCustomEndTime)} \u2192 ${fmt12h(customStartTime)} \u2013 ${fmt12h(customEndTime)}`;
    }

    // Multi-pill: per-pill detail
    const maxPills = Math.max(initialShiftCodeIds.length, pillCount);
    const initStarts = parseMultiTimes(initialCustomStartTime, maxPills);
    const initEnds = parseMultiTimes(initialCustomEndTime, maxPills);
    const curStarts = parseMultiTimes(customStartTime, maxPills);
    const curEnds = parseMultiTimes(customEndTime, maxPills);

    const parts: string[] = [];
    for (let i = 0; i < pillCount; i++) {
      if (initStarts[i] === curStarts[i] && initEnds[i] === curEnds[i]) continue;
      const label = currentShiftCodeIds[i] != null ? codeLabel(currentShiftCodeIds[i]) : '?';
      const hadPillTime = initStarts[i] != null || initEnds[i] != null;
      const hasPillTime = curStarts[i] != null || curEnds[i] != null;
      if (!hadPillTime && hasPillTime) {
        parts.push(`${label}: added ${fmt12h(curStarts[i])} \u2013 ${fmt12h(curEnds[i])}`);
      } else if (hadPillTime && !hasPillTime) {
        parts.push(`${label}: removed custom time`);
      } else {
        parts.push(`${label}: ${fmt12h(initStarts[i])} \u2013 ${fmt12h(initEnds[i])} \u2192 ${fmt12h(curStarts[i])} \u2013 ${fmt12h(curEnds[i])}`);
      }
    }
    return parts.length > 0 ? `Time: ${parts.join("; ")}` : null;
  }

  function describeNoteChange(): string | null {
    if (!hasNoteEdit || !getActiveIndicatorIds) return null;
    const tokens: string[] = [];
    for (const [faIdStr, initTypes] of Object.entries(initialNotesByFocusArea)) {
      const curTypes = getActiveIndicatorIds(Number(faIdStr));
      for (const id of curTypes) {
        if (!initTypes.includes(id)) {
          const name = indicatorTypes.find(ind => ind.id === id)?.name ?? "?";
          tokens.push(`+${name}`);
        }
      }
      for (const id of initTypes) {
        if (!curTypes.includes(id)) {
          const name = indicatorTypes.find(ind => ind.id === id)?.name ?? "?";
          tokens.push(`\u2212${name}`);
        }
      }
    }
    return tokens.length > 0 ? `Notes: ${tokens.join(", ")}` : null;
  }

  const shiftSummary = hasShiftEdit ? describeShiftChange() : null;
  const timeSummary = hasTimeEdit ? describeTimeChange() : null;
  const noteSummary = hasNoteEdit ? describeNoteChange() : null;

  function handleUndo() {
    // Revert absence type if it changed
    if ((currentAbsenceTypeId ?? null) !== initialAbsenceTypeId) {
      if (initialAbsenceTypeId != null) {
        const at = absenceTypes.find(a => a.id === initialAbsenceTypeId);
        if (at) onAbsenceSelect?.(at);
      } else {
        // Was a shift code before, revert to it
        onSelect(initialShift ?? "OFF", initialShiftCodeIds);
      }
    } else if (currentShift !== initialShift) {
      // Revert shift if it changed (non-absence case)
      onSelect(initialShift ?? "OFF", initialShiftCodeIds);
    }
    // Revert custom times if changed
    if (hasTimeEdit && onCustomTimeChange) {
      onCustomTimeChange(initialCustomStartTime, initialCustomEndTime);
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

  // Resolve effective default times: shift code custom times → category times
  function resolveDefaultTimes(shiftCode: ShiftCode | undefined): { start: string | null; end: string | null } {
    if (shiftCode?.defaultStartTime && shiftCode?.defaultEndTime) {
      return { start: shiftCode.defaultStartTime, end: shiftCode.defaultEndTime };
    }
    if (shiftCode?.categoryId && shiftCategories.length > 0) {
      const cat = shiftCategories.find(c => c.id === shiftCode.categoryId);
      if (cat?.startTime && cat?.endTime) {
        return { start: cat.startTime, end: cat.endTime };
      }
    }
    return { start: null, end: null };
  }

  // Compute custom-time bounds from the shift code's category (±1hr buffer)
  function getTimeBounds(shiftCode: ShiftCode | undefined): { minTime: string | null; maxTime: string | null } {
    let windowStart: string | null = null;
    let windowEnd: string | null = null;

    if (shiftCode?.categoryId && shiftCategories.length > 0) {
      const cat = shiftCategories.find(c => c.id === shiftCode.categoryId);
      windowStart = cat?.startTime ?? null;
      windowEnd = cat?.endTime ?? null;
    }
    // Fallback to code defaults if category has no times
    if (!windowStart) windowStart = shiftCode?.defaultStartTime ?? null;
    if (!windowEnd) windowEnd = shiftCode?.defaultEndTime ?? null;

    return {
      minTime: windowStart ? subtractOneHour(windowStart) : null,
      maxTime: windowEnd ? addOneHour(windowEnd) : null,
    };
  }

  // ── Double-shift time-sequential filtering ──────────────────────────────
  const isAddingSecondShift = showPicker && currentShiftCodeIds.length === 1;
  const firstShiftId = isAddingSecondShift ? currentShiftCodeIds[0] : null;

  const firstShiftEndTime: string | null = (() => {
    if (!isAddingSecondShift) return null;
    const firstCode = shiftCodes.find(sc => sc.id === firstShiftId);
    return resolveDefaultTimes(firstCode).end;
  })();

  const pickerShiftCodes = isAddingSecondShift && firstShiftEndTime
    ? shiftCodes.filter(sc => {
        // Never show the already-selected first shift
        if (sc.id === firstShiftId) return false;
        if (sc.isGeneral) return false;
        const { start } = resolveDefaultTimes(sc);
        if (!start) return false;
        // Candidate must start at or after first shift ends (prevents overlap + same-time)
        return timeToMinutes(start) >= timeToMinutes(firstShiftEndTime);
      })
    : shiftCodes;

  const pickerAbsenceTypes = isAddingSecondShift ? [] : absenceTypes;

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

    // Absence type pill — use absence type colors directly
    if (isAbsence) {
      const at = absenceTypes.find(a => a.id === currentAbsenceTypeId);
      if (!at) return null;
      const isCellNew = draftKind === 'new';
      const isCellModified = draftKind === 'modified';
      return (
        <div
          style={{
            background: at.color,
            border: isCellNew
              ? `2px dashed ${darkenColor(at.color, 0.35)}`
              : `1.5px solid ${at.border === 'transparent' ? darkenColor(at.color, 0.25) : at.border}`,
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
          <span style={{ fontWeight: 800, fontSize: "var(--dg-fs-card-title)", color: at.text, lineHeight: 1 }}>
            {at.label}
          </span>
          <span style={{ fontSize: "var(--dg-fs-footnote)", color: at.text, opacity: 0.7, lineHeight: 1 }}>
            {at.name}
          </span>
        </div>
      );
    }

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
          const isNewPill = (draftKind === 'new' && !initialShiftCodeIds.includes(currentShiftCodeIds[i]))
            || (draftKind !== 'new' && publishedShiftCodeIds.length > 0 && !publishedShiftCodeIds.includes(currentShiftCodeIds[i]));
          const isModifiedPill = draftKind === 'modified' && !isNewPill
            && !(publishedShiftCodeIds.length > 0 && publishedShiftCodeIds.includes(currentShiftCodeIds[i]));
          const faName = shiftCode?.focusAreaId != null
            ? focusAreas.find(fa => fa.id === shiftCode.focusAreaId)?.name
            : undefined;
          const { start: defaultStart, end: defaultEnd } = resolveDefaultTimes(shiftCode);
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
                    {calcTimeDuration(defaultStart, defaultEnd) && (
                      <span style={{ opacity: 0.7 }}>· {calcTimeDuration(defaultStart, defaultEnd)}</span>
                    )}
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
                      minTime={getTimeBounds(shiftCode).minTime}
                      maxTime={getTimeBounds(shiftCode).maxTime}
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
              absenceType={isAbsence ? absenceTypes?.find(at => at.id === currentAbsenceTypeId) : undefined}
            />
          ) : inDetailMode ? (
            // ── Detail mode ──────────────────────────────────────────────────
            <>
              {/* Current shift displayed prominently */}
              {renderCurrentShiftPill()}

              {/* Custom time override — single-shift only (multi-shift has per-pill editors); hidden for absence types */}
              {hasActiveShift && !currentAbsenceTypeId && allowShiftEdits && onCustomTimeChange && currentLabels.length <= 1 && (() => {
                const matchedCode = currentShiftCodeIds[0] != null
                  ? shiftCodes.find(st => st.id === currentShiftCodeIds[0])
                  : shiftCodes.find(st => st.label === currentLabels[0]);
                const defaults = resolveDefaultTimes(matchedCode);
                return (
                  <div style={{ marginBottom: 16 }}>
                    <PillTimeEditor
                      customStart={customStartTime ?? null}
                      customEnd={customEndTime ?? null}
                      defaultStart={defaults.start}
                      defaultEnd={defaults.end}
                      minTime={getTimeBounds(matchedCode).minTime}
                      maxTime={getTimeBounds(matchedCode).maxTime}
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
                    {isAbsence ? "Repeating — edit scope" : "Repeating shift — edit scope"}
                  </div>
                  <div className="dg-segment" style={{ display: "flex" }}>
                    <button
                      onClick={() => setSeriesScope("this")}
                      className={`dg-segment-btn${seriesScope === "this" ? " active" : ""}`}
                      style={{ flex: 1, fontSize: "var(--dg-fs-footnote)" }}
                    >
                      {isAbsence ? "This only" : "This shift"}
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
                    {isAbsence ? "Make this repeating" : "Make this a repeating shift"}
                  </button>
                </div>
              )}

              {/* Notes / Indicators — single shift only; multi-shift shows inline per pill; hidden for absences */}
              {currentLabels.length <= 1 && !isAbsence && renderNotesSection()}

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
                    {isAbsence
                      ? "Remove off day"
                      : currentLabels.length > 1
                        ? "Remove all shifts"
                        : "Remove shift"}
                  </button>
                </div>
              )}

              {/* Add another shift — hidden when at max (2), absence type, or first shift has no resolvable end time */}
              {allowShiftEdits && !isAbsence && currentLabels.length < 2 && (() => {
                const firstCode = shiftCodes.find(sc => sc.id === currentShiftCodeIds[0]);
                return firstCode ? resolveDefaultTimes(firstCode).end != null : true;
              })() && (
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
              {overlapWarnings.length > 0 && (
                <div style={{
                  marginTop: 16,
                  padding: "10px 12px",
                  background: "var(--color-warning-bg)",
                  border: "1px solid var(--color-warning-border)",
                  borderRadius: 8,
                }}>
                  <div style={{
                    fontSize: "var(--dg-fs-badge)",
                    fontWeight: 700,
                    color: "var(--color-warning-text)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}>
                    Overlap Warning
                  </div>
                  {overlapWarnings.map((w, i) => (
                    <div key={i} style={{
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--color-warning-text)",
                      marginTop: i > 0 ? 4 : 0,
                    }}>
                      {w}
                    </div>
                  ))}
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
              {isAddingSecondShift && pickerShiftCodes.length === 0 ? (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "var(--color-text-subtle)",
                    fontSize: "var(--dg-fs-label)",
                  }}
                >
                  No shifts start at or after {fmt12h(firstShiftEndTime)}.
                </div>
              ) : (
                <ShiftPicker
                  shiftCodes={pickerShiftCodes}
                  absenceTypes={pickerAbsenceTypes}
                  focusAreas={focusAreas}
                  currentShiftCodeIds={currentShiftCodeIds}
                  currentAbsenceTypeId={currentAbsenceTypeId}
                  onSelect={(_label, ids) => {
                    // Reconstruct label from full shiftCodes — the picker may have
                    // a filtered list that can't resolve the first shift's label.
                    const fullLabel = ids
                      .map(id => shiftCodes.find(sc => sc.id === id)?.label)
                      .filter((l): l is string => l != null && l !== "OFF")
                      .join("/") || _label;
                    onSelect(fullLabel, ids, seriesId ? seriesScope : undefined);
                    if (fullLabel !== "OFF") setShowPicker(false);
                  }}
                  onAbsenceSelect={(at) => {
                    onAbsenceSelect?.(at);
                    setShowPicker(false);
                  }}
                  empFocusAreaIds={modal.empFocusAreaIds}
                  empCertificationId={modal.empCertificationId}
                  initialTab={modal.activeFocusAreaId}
                  multiSelect={true}
                  closeOnSelect={false}
                />
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
              flexDirection: "column",
              gap: 6,
              background: "var(--color-surface)",
            }}
          >
            {(shiftSummary || timeSummary || noteSummary) && (
              <div style={{ fontSize: "var(--dg-fs-badge)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                {shiftSummary && <div>{shiftSummary}</div>}
                {timeSummary && <div>{timeSummary}</div>}
                {noteSummary && <div>{noteSummary}</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
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
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {pendingDelete && (
        <ConfirmDialog
          title={
            isAbsence
              ? "Remove Off Day?"
              : pendingDelete.type === "all" && currentLabels.length > 1
                ? "Remove All Shifts?"
                : "Remove Shift?"
          }
          message={
            isAbsence
              ? `Remove off day "${currentLabels[0]}" from ${modal.empName} on ${formatDate(modal.date)}?`
              : pendingDelete.type === "pill"
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
