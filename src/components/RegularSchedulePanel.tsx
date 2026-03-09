"use client";

import { useEffect, useState } from "react";
import { Employee, RegularShift, ShiftType } from "@/types";
import * as db from "@/lib/db";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface RegularSchedulePanelProps {
  employee: Employee;
  orgId: string;
  shiftTypes: ShiftType[];
  onClose: () => void;
}

export default function RegularSchedulePanel({
  employee,
  orgId,
  shiftTypes,
  onClose,
}: RegularSchedulePanelProps) {
  const [regularShifts, setRegularShifts] = useState<RegularShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local state: dayOfWeek -> shift label (empty string = "Off")
  const [schedule, setSchedule] = useState<Record<number, string>>({});

  // effectiveFrom for all changes in this session
  const todayKey = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  useEffect(() => {
    db.fetchRegularShifts(orgId, employee.id)
      .then(rows => {
        const map: Record<number, string> = {};
        // Use the most recently effective entry per day
        for (const rs of rows) {
          if (!(rs.dayOfWeek in map)) {
            map[rs.dayOfWeek] = rs.shiftLabel;
          }
        }
        setSchedule(map);
        setRegularShifts(rows);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [employee.id, orgId]);

  const qualifiedShiftTypes = shiftTypes.filter(
    st => !st.requiredDesignations?.length || st.requiredDesignations.includes(employee.designation)
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // For each day 0–6: upsert if has a label, delete if cleared
      for (let day = 0; day < 7; day++) {
        const newLabel = schedule[day];
        const existing = regularShifts.filter(rs => rs.dayOfWeek === day);

        if (newLabel) {
          await db.upsertRegularShift(employee.id, orgId, day, newLabel, todayKey);
        } else {
          // Clear: delete all existing regular shifts for this day
          for (const rs of existing) {
            await db.deleteRegularShift(employee.id, rs.dayOfWeek, rs.effectiveFrom);
          }
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 8,
  };

  return (
    <>
      {/* Backdrop */}
      <div className="dg-panel-overlay" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="dg-panel">
        {/* Header */}
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
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-secondary)" }}>
              Regular Schedule
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 2 }}>
              {employee.name}
              {employee.designation && (
                <>
                  {" · "}
                  <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>
                    {employee.designation}
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

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading ? (
            <div style={{ color: "var(--color-text-subtle)", fontSize: 13, padding: "16px 0" }}>
              Loading…
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
                Default shifts auto-filled when applying regular schedules.
                Leave a day blank to leave it unassigned.
              </p>

              <div style={sectionLabel}>Weekly Template</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DAY_NAMES.map((dayName, dayIndex) => {
                  const current = schedule[dayIndex] ?? "";
                  const shiftType = qualifiedShiftTypes.find(st => st.label === current);
                  return (
                    <div
                      key={dayIndex}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div
                        style={{
                          width: 36,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--color-text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {dayName}
                      </div>
                      <select
                        value={current}
                        onChange={e => setSchedule(prev => ({ ...prev, [dayIndex]: e.target.value }))}
                        className="dg-input"
                        style={{
                          flex: 1,
                          fontSize: 13,
                          fontWeight: current ? 600 : 400,
                          background: shiftType ? shiftType.color : undefined,
                          color: shiftType ? shiftType.text : undefined,
                          border: shiftType ? `1.5px solid ${shiftType.border}` : undefined,
                        }}
                      >
                        <option value="">— Off —</option>
                        {qualifiedShiftTypes.map(st => (
                          <option key={st.label} value={st.label}>
                            {st.label} — {st.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 12px",
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#DC2626",
                  }}
                >
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: 8,
            flexShrink: 0,
            background: "#fff",
          }}
        >
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="dg-btn dg-btn-primary"
            style={{ flex: 1 }}
          >
            {saving ? "Saving…" : "Save Regular Schedule"}
          </button>
          <button onClick={onClose} className="dg-btn" style={{ padding: "8px 14px" }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
