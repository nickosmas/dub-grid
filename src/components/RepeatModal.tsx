"use client";

import { useState } from "react";
import { SeriesFrequency, ShiftCode } from "@/types";

const DAY_NAMES_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface RepeatModalProps {
  empName: string;
  shiftLabel: string;
  startDate: Date;
  shiftCodes: ShiftCode[];
  onConfirm: (
    frequency: SeriesFrequency,
    daysOfWeek: number[] | null,
    startDate: string,
    endDate: string | null,
    maxOccurrences: number | null,
  ) => void;
  onClose: () => void;
}

type EndType = 'never' | 'on_date' | 'after_n';

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function RepeatModal({
  empName,
  shiftLabel,
  startDate,
  shiftCodes,
  onConfirm,
  onClose,
}: RepeatModalProps) {
  const [frequency, setFrequency] = useState<SeriesFrequency>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([startDate.getDay()]);
  const [start, setStart] = useState<string>(formatLocalDate(startDate));
  const [endType, setEndType] = useState<EndType>('never');
  const [endDate, setEndDate] = useState<string>('');
  const [afterN, setAfterN] = useState<number>(10);

  const shiftCode = shiftCodes.find(st => st.label === shiftLabel);

  function toggleDay(day: number) {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }

  function handleConfirm() {
    const resolvedDays =
      frequency === 'daily' ? null : daysOfWeek.length > 0 ? daysOfWeek : null;
    const resolvedEnd =
      endType === 'on_date' ? endDate || null :
      null;
    const resolvedMax =
      endType === 'after_n' ? afterN : null;
    onConfirm(frequency, resolvedDays, start, resolvedEnd, resolvedMax);
  }

  const showDayPicker = frequency === 'weekly' || frequency === 'biweekly';
  const canConfirm = !showDayPicker || daysOfWeek.length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          width: 400,
          maxWidth: "calc(100vw - 32px)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-secondary)" }}>
              Create Repeating Shift
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              {empName}
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
          </div>
          <button
            onClick={onClose}
            className="dg-btn dg-btn-ghost"
            style={{ border: "1px solid var(--color-border)", padding: "4px 8px", fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
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
                      style={{ fontSize: 12, padding: "4px 8px", flex: 1 }}
                    />
                  )}
                  {type === 'after_n' && endType === 'after_n' && (
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={afterN}
                      onChange={e => setAfterN(Math.max(1, parseInt(e.target.value) || 1))}
                      className="dg-input"
                      style={{ fontSize: 12, padding: "4px 8px", width: 70 }}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: 8,
          }}
        >
          <button onClick={onClose} className="dg-btn" style={{ padding: "8px 14px" }}>
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
