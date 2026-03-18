"use client";

import { useState, useMemo, useEffect } from "react";
import { SeriesFrequency, ShiftCode } from "@/types";
import { supabase } from "@/lib/supabase";
import { MAX_SERIES_OCCURRENCES, MS_PER_DAY } from "@/lib/constants";

const DAY_NAMES_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface RepeatFormProps {
  empId: string;
  shiftLabel: string;
  shiftCodeId: number;
  startDate: Date;
  shiftCodes: ShiftCode[];
  onConfirm: (
    frequency: SeriesFrequency,
    daysOfWeek: number[] | null,
    startDate: string,
    endDate: string | null,
    maxOccurrences: number | null,
  ) => void;
  onBack: () => void;
}

type EndType = 'never' | 'on_date' | 'after_n';

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compute occurrence dates (mirrors generateSeriesDates in db.ts). */
function countOccurrences(
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : null;
  const cap = maxOccurrences ?? MAX_SERIES_OCCURRENCES; // 6 months

  const current = new Date(start);

  while (dates.length < cap) {
    if (end && current > end) break;

    const y = current.getFullYear();
    const mo = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dayOfWeek = current.getDay();

    let include = false;
    if (frequency === 'daily') {
      include = true;
    } else if (frequency === 'weekly') {
      include = !daysOfWeek?.length || daysOfWeek.includes(dayOfWeek);
    } else if (frequency === 'biweekly') {
      const diffDays = Math.round((current.getTime() - start.getTime()) / MS_PER_DAY);
      const weekNum = Math.floor(diffDays / 7);
      include = weekNum % 2 === 0 && (!daysOfWeek?.length || daysOfWeek.includes(dayOfWeek));
    }

    if (include) dates.push(`${y}-${mo}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export default function RepeatForm({
  empId,
  shiftLabel,
  shiftCodeId,
  startDate,
  shiftCodes,
  onConfirm,
  onBack,
}: RepeatFormProps) {
  const [frequency, setFrequency] = useState<SeriesFrequency>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([startDate.getDay()]);
  const todayStr = formatLocalDate(new Date());
  const [start, setStart] = useState<string>(formatLocalDate(startDate));
  const [endType, setEndType] = useState<EndType>('never');
  const [endDate, setEndDate] = useState<string>('');
  const [afterN, setAfterN] = useState<number>(10);
  const [overwrites, setOverwrites] = useState(0);

  const shiftCode = shiftCodes.find(st => st.id === shiftCodeId);

  function toggleDay(day: number) {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }

  const resolvedDays = frequency === 'daily' ? null : daysOfWeek.length > 0 ? daysOfWeek : null;
  const resolvedEnd = endType === 'on_date' ? endDate || null : null;
  const resolvedMax = endType === 'after_n' ? afterN : null;

  const originDateKey = formatLocalDate(startDate);
  const generatedDates = useMemo(() => {
    if (frequency !== 'daily' && daysOfWeek.length === 0) return [];
    return countOccurrences(frequency, resolvedDays, start, resolvedEnd, resolvedMax);
  }, [frequency, daysOfWeek, resolvedDays, start, resolvedEnd, resolvedMax]);

  useEffect(() => {
    if (generatedDates.length === 0) { setOverwrites(0); return; }

    let cancelled = false;
    const datesToCheck = new Set(generatedDates.filter(d => d !== originDateKey));
    if (datesToCheck.size === 0) { setOverwrites(0); return; }

    const sortedDates = [...datesToCheck].sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];

    (async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("date")
        .eq("emp_id", empId)
        .gte("date", minDate)
        .lte("date", maxDate);
      if (cancelled) return;
      if (error) { console.error("Overwrite check failed:", error.message); return; }
      const overlap = (data ?? []).filter((row: { date: string }) => datesToCheck.has(row.date)).length;
      setOverwrites(overlap);
    })();

    return () => { cancelled = true; };
  }, [generatedDates, empId, originDateKey]);

  const preview = { total: generatedDates.length, overwrites };
  const endDateInvalid = endType === 'on_date' && endDate !== '' && endDate < start;

  function handleConfirm() {
    if (endDateInvalid) return;
    onConfirm(frequency, resolvedDays, start, resolvedEnd, resolvedMax);
  }

  const showDayPicker = frequency === 'weekly' || frequency === 'biweekly';
  const canConfirm = (!showDayPicker || daysOfWeek.length > 0) && !endDateInvalid && preview.total > 0;
  const isCapped = preview.total >= MAX_SERIES_OCCURRENCES && endType !== 'after_n';

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
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

      {/* Shift badge */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={sectionLabelStyle}>Repeating Shift</span>
        {shiftCode && (
          <span
            style={{
              background: shiftCode.color,
              color: shiftCode.text,
              border: `1px solid ${shiftCode.border}`,
              borderRadius: 6,
              padding: "1px 7px",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {shiftLabel}
          </span>
        )}
      </div>

      {/* Frequency */}
      <div style={{ marginBottom: 18 }}>
        <div style={sectionLabelStyle}>Frequency</div>
        <div className="dg-segment" style={{ display: "flex" }}>
          {(["daily", "weekly", "biweekly"] as SeriesFrequency[]).map(f => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className={`dg-segment-btn${frequency === f ? " active" : ""}`}
              style={{ flex: 1, textTransform: "capitalize" }}
            >
              {f === 'biweekly' ? 'Biweekly' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Day picker (weekly / biweekly) */}
      {showDayPicker && (
        <div style={{ marginBottom: 18 }}>
          <div style={sectionLabelStyle}>Days of Week</div>
          <div style={{ display: "flex", gap: 6 }}>
            {DAY_NAMES_SHORT.map((name, i) => {
              const active = daysOfWeek.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  title={DAY_NAMES_FULL[i]}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    border: `1.5px solid ${active ? "#1B3A2D" : "var(--color-border)"}`,
                    background: active ? "#1B3A2D" : "#fff",
                    color: active ? "#fff" : "var(--color-text-muted)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    flexShrink: 0,
                    fontFamily: "inherit",
                    transition: "background 150ms, border-color 150ms",
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
          {daysOfWeek.length === 0 && (
            <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>
              Select at least one day.
            </div>
          )}
        </div>
      )}

      {/* Start date */}
      <div style={{ marginBottom: 18 }}>
        <div style={sectionLabelStyle}>Start Date</div>
        <input
          type="date"
          value={start}
          min={todayStr}
          onChange={e => setStart(e.target.value)}
          className="dg-input"
          style={{ width: "100%", fontSize: 13 }}
        />
      </div>

      {/* End */}
      <div style={{ marginBottom: 4 }}>
        <div style={sectionLabelStyle}>Ends</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(["never", "on_date", "after_n"] as EndType[]).map(type => (
            <label
              key={type}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <input
                type="radio"
                checked={endType === type}
                onChange={() => setEndType(type)}
                style={{ accentColor: "#1B3A2D" }}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                {type === 'never' ? 'Never' : type === 'on_date' ? 'On date' : 'After N occurrences'}
              </span>
              {type === 'on_date' && endType === 'on_date' && (
                <input
                  type="date"
                  value={endDate}
                  min={start}
                  onChange={e => setEndDate(e.target.value)}
                  className="dg-input"
                  style={{
                    fontSize: 12, padding: "4px 8px", flex: 1,
                    ...(endDateInvalid ? { borderColor: "#DC2626" } : {}),
                  }}
                />
              )}
              {type === 'after_n' && endType === 'after_n' && (
                <input
                  type="number"
                  min={1}
                  max={MAX_SERIES_OCCURRENCES}
                  value={afterN}
                  onChange={e => setAfterN(Math.min(MAX_SERIES_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="dg-input"
                  style={{ fontSize: 12, padding: "4px 8px", width: 70 }}
                />
              )}
            </label>
          ))}
        </div>
        {endDateInvalid && (
          <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>
            End date must be on or after start date.
          </div>
        )}
      </div>

      {/* Preview summary */}
      {preview.total > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 12px",
            borderRadius: 8,
            background: preview.overwrites > 0 ? "#FEF3C7" : "#F0FDF4",
            border: `1px solid ${preview.overwrites > 0 ? "#F59E0B" : "#BBF7D0"}`,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {preview.total} shift{preview.total === 1 ? '' : 's'} will be created
            {endType === 'never' && (
              <span style={{ fontWeight: 400, color: "var(--color-text-subtle)" }}> (6-month max)</span>
            )}
          </div>
          {isCapped && (
            <div style={{ marginTop: 4, color: "#92400E", fontWeight: 500 }}>
              Series capped at {MAX_SERIES_OCCURRENCES} occurrences (~6 months). Use a shorter date range or &ldquo;After N occurrences&rdquo; for more control.
            </div>
          )}
          {preview.overwrites > 0 && (
            <div style={{ marginTop: 4, color: "#92400E", fontWeight: 500 }}>
              {preview.overwrites} existing shift{preview.overwrites === 1 ? '' : 's'} will be overwritten.
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onBack} className="dg-btn" style={{ padding: "8px 14px" }}>
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="dg-btn dg-btn-primary"
          style={{ flex: 1, opacity: canConfirm ? 1 : 0.5 }}
        >
          Create Repeating Shift
        </button>
      </div>
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 8,
};
