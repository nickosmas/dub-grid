"use client";

import { useState, useMemo, useCallback } from "react";
import type { Employee } from "@/types";
import Modal from "@/components/Modal";

/* ── Inline Calendar ───────────────────────────────────────────────── */
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function InlineCalendar({
  value,
  min,
  onChange,
  getShiftInfo,
}: {
  value: string;
  min: string;
  onChange: (iso: string) => void;
  /** Returns shift label + requestable flag for a given ISO date, or null if no shift */
  getShiftInfo?: (iso: string) => { label: string; requestable: boolean } | null;
}) {
  const today = new Date();
  const initialMonth = value
    ? new Date(value + "T00:00:00")
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const [view, setView] = useState({ year: initialMonth.getFullYear(), month: initialMonth.getMonth() });
  const { year: viewYear, month: viewMonth } = view;

  const minDate = min ? new Date(min + "T00:00:00") : null;

  const goMonth = useCallback((delta: 1 | -1) => {
    setView((v) => {
      const next = v.month + delta;
      if (next < 0) return { year: v.year - 1, month: 11 };
      if (next > 11) return { year: v.year + 1, month: 0 };
      return { year: v.year, month: next };
    });
  }, []);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleString("en-US", { month: "long", year: "numeric" });

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  function toIso(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isDisabled(day: number) {
    if (!minDate) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  }

  function isToday(day: number) {
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => goMonth(-1)}
          title="Previous month"
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
            fontSize: 16, color: "var(--color-text-secondary)", borderRadius: 6, fontFamily: "inherit",
          }}
        >
          ‹
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => goMonth(1)}
          title="Next month"
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
            fontSize: 16, color: "var(--color-text-secondary)", borderRadius: 6, fontFamily: "inherit",
          }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map((label, i) => (
          <div
            key={i}
            style={{
              textAlign: "center", fontSize: 11, fontWeight: 600,
              color: "var(--color-text-faint)", padding: "2px 0",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const iso = toIso(day);
          const disabled = isDisabled(day);
          const selected = iso === value;
          const todayMark = isToday(day);
          const shift = !disabled && getShiftInfo ? getShiftInfo(iso) : null;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "4px 2px 3px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                fontSize: 13,
                fontWeight: selected ? 700 : todayMark ? 600 : 400,
                color: disabled
                  ? "var(--color-text-faint)"
                  : selected
                    ? "#fff"
                    : "var(--color-text-primary)",
                background: selected
                  ? "var(--color-primary, #2563EB)"
                  : "none",
                border: todayMark && !selected ? "1px solid var(--color-primary, #2563EB)" : "none",
                borderRadius: 8,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
                fontFamily: "inherit",
                transition: "background 100ms ease",
              }}
              onMouseEnter={(e) => {
                if (!disabled && !selected) e.currentTarget.style.background = "var(--color-surface-overlay)";
              }}
              onMouseLeave={(e) => {
                if (!disabled && !selected) e.currentTarget.style.background = "none";
              }}
            >
              {day}
              {shift && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: selected
                      ? "rgba(255,255,255,0.85)"
                      : shift.requestable
                        ? "#16A34A"
                        : "#92400E",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shift.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ShiftSwapModalProps {
  /** The requester's employee info */
  requesterEmpId: string;
  requesterName: string;
  /** The shift being offered for swap */
  shiftDate: string;
  shiftLabel: string;
  /** All employees in the org (to select swap target) */
  employees: Employee[];
  /** Current shifts map — to show what shifts potential targets have */
  shiftForKey: (empId: string, date: Date) => string | null;
  /** Check if a shift has swappable (categorized, non-off-day) codes */
  isRequestableShift: (empId: string, date: Date) => boolean;
  /** Submit the swap proposal */
  onSubmit: (targetEmpId: string, targetShiftDate: string) => void;
  onClose: () => void;
}

export default function ShiftSwapModal({
  requesterEmpId,
  requesterName,
  shiftDate,
  shiftLabel,
  employees,
  shiftForKey,
  isRequestableShift,
  onSubmit,
  onClose,
}: ShiftSwapModalProps) {
  const [selectedTargetEmpId, setSelectedTargetEmpId] = useState<string | null>(null);
  const [selectedTargetDate, setSelectedTargetDate] = useState<string>("");

  const availableEmployees = useMemo(
    () => employees.filter((emp) => emp.id !== requesterEmpId && !emp.archivedAt && emp.status === "active"),
    [employees, requesterEmpId]
  );

  const selectedEmployee = useMemo(
    () => availableEmployees.find((emp) => emp.id === selectedTargetEmpId) ?? null,
    [availableEmployees, selectedTargetEmpId]
  );

  const targetShiftLabel = useMemo(() => {
    if (!selectedTargetEmpId || !selectedTargetDate) return null;
    return shiftForKey(selectedTargetEmpId, new Date(selectedTargetDate + "T00:00:00"));
  }, [selectedTargetEmpId, selectedTargetDate, shiftForKey]);

  const targetIsRequestable = useMemo(() => {
    if (!selectedTargetEmpId || !selectedTargetDate) return false;
    return isRequestableShift(selectedTargetEmpId, new Date(selectedTargetDate + "T00:00:00"));
  }, [selectedTargetEmpId, selectedTargetDate, isRequestableShift]);

  const canSubmit = selectedTargetEmpId !== null && selectedTargetDate !== "" && targetShiftLabel !== null && targetIsRequestable;

  function handleSelectEmployee(empId: string) {
    setSelectedTargetEmpId(empId);
    setSelectedTargetDate("");
  }

  function handleSubmit() {
    if (!selectedTargetEmpId || !selectedTargetDate) return;
    onSubmit(selectedTargetEmpId, selectedTargetDate);
  }

  return (
    <Modal title="Propose a Swap" onClose={onClose} style={{ maxWidth: 480, width: "100%" }}>
      {/* Requester shift info */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          backgroundColor: "var(--color-bg-secondary)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginBottom: 2 }}>
          Your shift
        </div>
        <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
          {shiftLabel}
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8 }}>
            {shiftDate}
          </span>
        </div>
      </div>

      {/* Confirmation view when employee + date are selected and target has a shift */}
      {canSubmit && selectedEmployee ? (
        <div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "14px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              marginBottom: 16,
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>You give</span>
              <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                {shiftLabel}
                <span
                  style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8 }}
                >
                  on {shiftDate}
                </span>
              </div>
            </div>
            <div
              style={{
                borderTop: "1px solid var(--color-border)",
                paddingTop: 10,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>You get</span>
              <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                {targetShiftLabel}
                <span
                  style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8 }}
                >
                  on {selectedTargetDate}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                from {selectedEmployee.firstName} {selectedEmployee.lastName}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="dg-btn dg-btn-ghost"
              onClick={() => {
                setSelectedTargetEmpId(null);
                setSelectedTargetDate("");
              }}
            >
              Back
            </button>
            <button className="dg-btn dg-btn-primary" onClick={handleSubmit}>
              Submit Swap Request
            </button>
          </div>
        </div>
      ) : (
        /* Employee selection + date picker */
        <div>
          {/* Step label */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              marginBottom: 8,
            }}
          >
            {selectedTargetEmpId ? "Pick a date for their shift" : "Select an employee to swap with"}
          </div>

          {/* Employee list */}
          {!selectedTargetEmpId && (
            <div
              style={{
                maxHeight: 260,
                overflowY: "auto",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              {availableEmployees.length === 0 && (
                <div
                  style={{
                    padding: "20px 14px",
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    fontSize: 13,
                  }}
                >
                  No other employees available
                </div>
              )}
              {availableEmployees.map((emp, idx) => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    borderBottom:
                      idx < availableEmployees.length - 1
                        ? "1px solid var(--color-border)"
                        : "none",
                    cursor: "pointer",
                    color: "var(--color-text-primary)",
                    fontSize: 14,
                  }}
                >
                  {emp.firstName} {emp.lastName}
                </button>
              ))}
            </div>
          )}

          {/* Date picker after employee is selected */}
          {selectedTargetEmpId && selectedEmployee && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                  marginBottom: 6,
                }}
              >
                Swapping with{" "}
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </span>
              </div>

              <InlineCalendar
                value={selectedTargetDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(iso) => setSelectedTargetDate(iso)}
                getShiftInfo={(iso) => {
                  if (!selectedTargetEmpId) return null;
                  const d = new Date(iso + "T00:00:00");
                  const label = shiftForKey(selectedTargetEmpId, d);
                  if (!label) return null;
                  return { label, requestable: isRequestableShift(selectedTargetEmpId, d) };
                }}
              />

              {/* Show resolved shift or warning */}
              {selectedTargetDate && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {targetShiftLabel && targetIsRequestable ? (
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      Shift on that date:{" "}
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {targetShiftLabel}
                      </span>
                    </span>
                  ) : targetShiftLabel && !targetIsRequestable ? (
                    <span style={{ color: "#92400E" }}>
                      That shift is not eligible for swaps (off-day or uncategorized).
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>
                      No published shift found on that date.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {selectedTargetEmpId ? (
              <>
                <button
                  className="dg-btn dg-btn-ghost"
                  onClick={() => {
                    setSelectedTargetEmpId(null);
                    setSelectedTargetDate("");
                  }}
                >
                  Back
                </button>
                <button
                  className="dg-btn dg-btn-primary"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  style={{ opacity: canSubmit ? 1 : 0.5 }}
                >
                  Continue
                </button>
              </>
            ) : (
              <button className="dg-btn dg-btn-ghost" onClick={onClose}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
