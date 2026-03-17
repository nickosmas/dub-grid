"use client";

import { useEffect, useRef, useState } from "react";
import { Employee, FocusArea, RecurringShift, ShiftCode, NamedItem } from "@/types";
import * as db from "@/lib/db";
import { getCertName } from "@/lib/utils";
import { toast } from "sonner";
import ShiftPicker from "./ShiftPicker";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

interface RecurringSchedulePanelProps {
  employee: Employee;
  orgId: string;
  shiftCodes: ShiftCode[];
  /** Full code map (including archived) for resolving historical labels. */
  shiftCodeMap: Map<number, string>;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  onClose: () => void;
}

// ── Inline day picker ─────────────────────────────────────────────────────────
export function DayPicker({
  dayName,
  currentLabel,
  shiftCodes,
  focusAreas = [],
  open,
  onOpen,
  onClose,
  onSelect,
}: {
  dayName: string;
  currentLabel: string;
  shiftCodes: ShiftCode[];
  focusAreas?: FocusArea[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (label: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shiftCode = shiftCodes.find((st) => st.label === currentLabel);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);


  return (
    <div ref={containerRef}>
      {/* Trigger */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={open ? onClose : onOpen}
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
        <button
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px 12px",
            background: shiftCode ? shiftCode.color : "#F8FAFC",
            border: shiftCode ? "1px solid rgba(0,0,0,0.15)" : open ? "1.5px solid #94A3B8" : "1.5px solid #E2E8F0",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "border-color 120ms ease",
            outline: open ? "2px solid #BFDBFE" : "none",
            outlineOffset: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {shiftCode ? (
              <>
                <span style={{ fontWeight: 800, fontSize: 13, color: shiftCode.text }}>
                  {shiftCode.label}
                </span>
                {shiftCode.name && shiftCode.name !== shiftCode.label && (
                  <span style={{ fontSize: 11, color: shiftCode.text, opacity: 0.75 }}>
                    {shiftCode.name}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 12, color:"#64748B", fontWeight: 500 }}>— Off —</span>
            )}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={shiftCode ? shiftCode.text : "#94A3B8"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 150ms ease",
              flexShrink: 0,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Inline expansion — renders in-flow to avoid clipping by parent overflow */}
      {open && (
        <div
          style={{
            marginTop: 8,
            marginLeft: 46,
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            width: 440,
            padding: "16px 20px",
          }}
        >
          <ShiftPicker
            shiftCodes={shiftCodes}
            focusAreas={focusAreas}
            currentShiftCodeIds={currentLabel && currentLabel !== "OFF" ? shiftCodes.filter(sc => currentLabel.split("/").includes(sc.label)).map(sc => sc.id) : []}
            onSelect={(label) => {
              onSelect(label);
              onClose();
            }}
            multiSelect={false}
            closeOnSelect={true}
          />
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function RecurringSchedulePanel({
  employee,
  orgId,
  shiftCodes,
  shiftCodeMap,
  focusAreas,
  certifications,
  onClose,
}: RecurringSchedulePanelProps) {
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<number, string>>({});
  const [openDayIndex, setOpenDayIndex] = useState<number | null>(null);

  const todayKey = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();

  useEffect(() => {
    db.fetchRecurringShifts(orgId, employee.id, shiftCodeMap)
      .then((rows) => {
        const map: Record<number, string> = {};
        for (const rs of rows) {
          if (!(rs.dayOfWeek in map)) {
            map[rs.dayOfWeek] = rs.shiftLabel;
          }
        }
        setSchedule(map);
        setRecurringShifts(rows);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [employee.id, orgId]);

  const qualifiedShiftCodes = shiftCodes.filter((st) => {
    const certOk =
      !st.requiredCertificationIds?.length ||
      (employee.certificationId != null && st.requiredCertificationIds.includes(employee.certificationId));
    const areaOk = !st.focusAreaId || employee.focusAreaIds.includes(st.focusAreaId);
    return certOk && areaOk;
  });

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (let day = 0; day < 7; day++) {
        const newLabel = schedule[day];
        const existing = recurringShifts.filter((rs) => rs.dayOfWeek === day);

        if (newLabel) {
          const sc = shiftCodes.find(s => s.label === newLabel);
          if (!sc) continue;
          await db.upsertRecurringShift(employee.id, orgId, day, sc.id, todayKey);
        } else if (existing.length > 0) {
          await db.deleteRecurringShift(employee.id, day);
        }
      }
      toast.success("Recurring schedule saved");
      onClose();
    } catch (err: any) {
      toast.error("Failed to save recurring schedule");
      setError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="dg-panel-overlay" onClick={onClose} />
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
              Recurring Schedule
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 2 }}>
              {employee.name}
              {employee.certificationId != null && (
                <>
                  {" · "}
                  <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>
                    {getCertName(employee.certificationId, certifications)}
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
                Default shifts auto-filled when applying recurring schedules.
                Leave a day blank to leave it unassigned.
              </p>

              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                Weekly Template
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DAY_NAMES.map((dayName, dayIndex) => (
                  <DayPicker
                    key={dayIndex}
                    dayName={dayName}
                    currentLabel={schedule[dayIndex] ?? ""}
                    shiftCodes={qualifiedShiftCodes}
                    focusAreas={focusAreas}
                    open={openDayIndex === dayIndex}
                    onOpen={() => setOpenDayIndex(dayIndex)}
                    onClose={() => setOpenDayIndex(null)}
                    onSelect={(label) =>
                      setSchedule((prev) => ({ ...prev, [dayIndex]: label }))
                    }
                  />
                ))}
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
            {saving ? "Saving…" : "Save Recurring Schedule"}
          </button>
          <button onClick={onClose} className="dg-btn" style={{ padding: "8px 14px" }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
