import { useState, useEffect } from "react";
import { calcTimeDuration } from "@/lib/utils";
import { Button } from "@/components/Button";
import CustomSelect from "./CustomSelect";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import {
  parseTo12h,
  to24h,
  fmt12h,
  normalizeTime,
  isValidTimeOrder,
  subtractOneHour,
  addOneHour,
} from "./shiftEditTime";

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

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
  return (
    <CustomSelect
      value={value}
      options={options}
      onChange={onChange}
      placeholder={placeholder ?? "--"}
      style={{ width }}
      height={30}
      fontSize="var(--dg-fs-caption)"
    />
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

export function PillTimeEditor({
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
  const hasCustomTime = !!(customStart || customEnd);
  const [editing, setEditing] = useState(false);
  // Snapshot of saved values when editing begins — used by Cancel to revert auto-saved changes.
  const [savedStart, setSavedStart] = useState<string | null>(customStart);
  const [savedEnd, setSavedEnd] = useState<string | null>(customEnd);

  // Local state for intermediate edits (needed because an individual dropdown change
  // may create a temporarily invalid state while the user adjusts other fields).
  // Pre-populate with defaults when no custom times exist so the user starts from a known value.
  const [localStart, setLocalStart] = useState<string | null>(customStart ?? defaultStart);
  const [localEnd, setLocalEnd] = useState<string | null>(customEnd ?? defaultEnd);

  // Re-sync local state when parent props change (e.g. after undo or external update).
  // Uses the "adjust state during render" pattern to avoid useEffect + setState.
  const [prevStart, setPrevStart] = useState(customStart);
  const [prevEnd, setPrevEnd] = useState(customEnd);
  if (customStart !== prevStart || customEnd !== prevEnd) {
    setPrevStart(customStart);
    setPrevEnd(customEnd);
    setLocalStart(customStart ?? defaultStart);
    setLocalEnd(customEnd ?? defaultEnd);
    if (!customStart && !customEnd) setEditing(false);
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

  function startEditing() {
    setSavedStart(customStart);
    setSavedEnd(customEnd);
    setEditing(true);
  }

  function handleCancel() {
    // Revert auto-saved changes back to what was saved when editing began
    if (savedStart !== customStart || savedEnd !== customEnd) {
      onSave(savedStart, savedEnd);
    }
    // If there was nothing saved originally, also call onRemove to clean up
    if (!savedStart && !savedEnd) {
      onRemove();
    }
    setLocalStart(savedStart ?? defaultStart);
    setLocalEnd(savedEnd ?? defaultEnd);
    setEditing(false);
  }

  // State 1: No custom time set — show "Custom time" button to add one
  if (!hasCustomTime && !editing) {
    return (
      <Hint content={hint("Override this shift's start and end times")} side="left">
        <Button
          data-tour="edit-panel-custom-time"
          onClick={() => startEditing()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-subtle)",
            background: "none",
            border: "1px dashed var(--dg-color-border)",
            borderRadius: "var(--dg-radius-md)",
            padding: "6px 10px",
            cursor: "pointer",
            fontFamily: "inherit",
            width: "100%",
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Custom time
          {(defaultStart || defaultEnd) && (
            <span style={{ color: "var(--dg-color-text-muted)" }}>
              ·{" "}
              {[defaultStart ? fmt12h(defaultStart) : null, defaultEnd ? fmt12h(defaultEnd) : null]
                .filter(Boolean)
                .join(" – ")}
              {calcTimeDuration(defaultStart, defaultEnd)
                ? ` (${calcTimeDuration(defaultStart, defaultEnd)})`
                : ""}
            </span>
          )}
        </Button>
      </Hint>
    );
  }

  // State 2: Custom time is set and not editing — show formatted text with Edit/Remove
  if (hasCustomTime && !editing) {
    const duration = calcTimeDuration(customStart ?? null, customEnd ?? null);
    return (
      <div
        style={{
          background: "var(--dg-color-bg)",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-md)",
          padding: "10px",
          marginTop: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-badge)",
              fontWeight: 700,
              color: "var(--dg-color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Custom Time
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 600,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              {fmt12h(customStart)} – {fmt12h(customEnd)}
            </span>
            {duration && (
              <span
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  color: "var(--dg-color-text-muted)",
                  marginLeft: 8,
                  fontWeight: 600,
                }}
              >
                ({duration})
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button
              onClick={() => startEditing()}
              style={{
                fontSize: "var(--dg-fs-badge)",
                color: "var(--dg-color-brand)",
                background: "var(--dg-color-brand-bg)",
                border: "1px solid var(--dg-color-brand-border)",
                borderRadius: "var(--dg-radius-sm)",
                cursor: "pointer",
                padding: "4px 10px",
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              Edit
            </Button>
            <Button
              onClick={() => {
                onRemove();
              }}
              style={{
                fontSize: "var(--dg-fs-badge)",
                color: "var(--dg-color-danger)",
                background: "var(--dg-color-surface)",
                border: "1px solid var(--dg-color-border)",
                borderRadius: "var(--dg-radius-sm)",
                cursor: "pointer",
                padding: "4px 10px",
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Editing — show the dropdowns
  return (
    <div
      style={{
        background: "var(--dg-color-bg)",
        border: "1px solid var(--dg-color-border)",
        borderRadius: "var(--dg-radius-md)",
        padding: "10px",
        marginTop: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 700,
            color: "var(--dg-color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Custom Time
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <Button
            onClick={handleCancel}
            style={{
              fontSize: "var(--dg-fs-badge)",
              color: "var(--dg-color-text-secondary)",
              background: "var(--dg-color-surface)",
              border: "1px solid var(--dg-color-border)",
              borderRadius: "var(--dg-radius-sm)",
              cursor: "pointer",
              padding: "4px 10px",
              fontFamily: "inherit",
              fontWeight: 600,
            }}
          >
            Cancel
          </Button>
          {hasCustomTime && (
            <Button
              onClick={() => {
                onRemove();
                setEditing(false);
              }}
              style={{
                fontSize: "var(--dg-fs-badge)",
                color: "var(--dg-color-danger)",
                background: "var(--dg-color-surface)",
                border: "1px solid var(--dg-color-border)",
                borderRadius: "var(--dg-radius-sm)",
                cursor: "pointer",
                padding: "4px 10px",
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Start row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <span
          style={{
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 700,
            color: "var(--dg-color-text-subtle)",
            width: 40,
            flexShrink: 0,
          }}
        >
          START
        </span>
        <TimeDropdown
          value={s.hour}
          options={hourOptions}
          onChange={(v) => updateStart(v, s.minute, s.period)}
          width={64}
          placeholder="--"
        />
        <span
          style={{
            fontWeight: 700,
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          :
        </span>
        <TimeDropdown
          value={s.minute}
          options={minuteOptions}
          onChange={(v) => updateStart(s.hour, v, s.period)}
          width={64}
        />
        <TimeDropdown
          value={s.period}
          options={periodOptions}
          onChange={(v) => updateStart(s.hour, s.minute, v as "AM" | "PM")}
          width={68}
        />
      </div>

      {/* End row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 700,
            color: "var(--dg-color-text-subtle)",
            width: 40,
            flexShrink: 0,
          }}
        >
          END
        </span>
        <TimeDropdown
          value={e.hour}
          options={hourOptions}
          onChange={(v) => updateEnd(v, e.minute, e.period)}
          width={64}
          placeholder="--"
        />
        <span
          style={{
            fontWeight: 700,
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          :
        </span>
        <TimeDropdown
          value={e.minute}
          options={minuteOptions}
          onChange={(v) => updateEnd(e.hour, v, e.period)}
          width={64}
        />
        <TimeDropdown
          value={e.period}
          options={periodOptions}
          onChange={(v) => updateEnd(e.hour, e.minute, v as "AM" | "PM")}
          width={68}
        />
      </div>

      {/* Duration display */}
      {calcTimeDuration(localStart, localEnd) && !hasTimeError && (
        <div
          style={{
            fontSize: "var(--dg-fs-badge)",
            color: "var(--dg-color-text-muted)",
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          Duration:{" "}
          <span style={{ color: "var(--dg-color-text-secondary)" }}>
            {calcTimeDuration(localStart, localEnd)}
          </span>
        </div>
      )}

      {/* Validation errors */}
      {hasTimeError && (
        <div
          style={{
            color: "var(--dg-color-danger)",
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          Start and end time cannot be the same
        </div>
      )}
      {isStartTooEarly && minTime && (
        <div
          style={{
            color: "var(--dg-color-danger)",
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          Start cannot be before {fmt12h(minTime)}
        </div>
      )}
      {isEndTooLate && maxTime && (
        <div
          style={{
            color: "var(--dg-color-danger)",
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          End cannot be after {fmt12h(maxTime)}
        </div>
      )}
    </div>
  );
}
// ────────────────────────────────────────────────────────────────────────────
