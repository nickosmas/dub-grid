"use client";

import { useEffect, useRef, useState } from "react";
import { Employee, FocusArea, RegularShift, ShiftCode, NamedItem } from "@/types";
import * as db from "@/lib/db";
import { getCertName } from "@/lib/utils";
import { toast } from "sonner";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface RegularSchedulePanelProps {
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

  const regularShifts = shiftCodes.filter((st) => !st.isOffDay);
  const offDayShifts = shiftCodes.filter((st) => st.isOffDay);

  // Group regular shifts by focus area
  const generalShifts = regularShifts.filter((st) => !st.focusAreaId);
  const groupedByFocusArea = focusAreas
    .map((fa) => ({
      focusArea: fa,
      shifts: regularShifts.filter((st) => st.focusAreaId === fa.id),
    }))
    .filter((g) => g.shifts.length > 0);
  const hasFocusAreaGroups = groupedByFocusArea.length > 0;

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
  };

  function ShiftTile({ st, isOff = false }: { st?: ShiftCode; isOff?: boolean }) {
    const isActive = isOff ? currentLabel === "" : currentLabel === st?.label;
    const bg = isOff ? "#F8FAFC" : st?.color ?? "#F8FAFC";
    const border = isOff ? "#CBD5E1" : st?.border ?? "#CBD5E1";
    const text = isOff ? "#64748B" : st?.text ?? "#64748B";

    return (
      <button
        onClick={() => {
          onSelect(isOff ? "" : st!.label);
          onClose();
        }}
        style={{
          background: isActive ? bg : "#F8FAFC",
          border: isActive ? "1px solid rgba(0,0,0,0.15)" : "1px solid rgba(0,0,0,0.1)",
          borderRadius: 6,
          padding: "8px 10px",
          cursor: "pointer",
          textAlign: "left",
          transition: "border-color 120ms ease, background 120ms ease",
          outline: isActive ? `2px solid ${border}` : "none",
          outlineOffset: 1,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = `${bg}25`;
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "#fff";
        }}
      >
        {isOff ? (
          <div style={{ fontSize: 11, fontWeight: 700, color:"#64748B" }}>— Off —</div>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 13, color: isActive ? text : border }}>
              {st!.label}
            </div>
            {st!.name && st!.name !== st!.label && (
              <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 2 }}>
                {st!.name}
              </div>
            )}
          </>
        )}
      </button>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
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
            borderRadius: 6,
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

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 46,
            right: 0,
            zIndex: 200,
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Off option */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
            <ShiftTile isOff />
          </div>

          {/* Regular shifts — grouped by focus area when available */}
          {hasFocusAreaGroups ? (
            <>
              {groupedByFocusArea.map(({ focusArea, shifts }) => (
                <div key={focusArea.id}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    {focusArea.name}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {shifts.map((st) => (
                      <ShiftTile key={st.id} st={st} />
                    ))}
                  </div>
                </div>
              ))}
              {generalShifts.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    General
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {generalShifts.map((st) => (
                      <ShiftTile key={st.id} st={st} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            regularShifts.length > 0 && (
              <div>
                <div style={sectionLabel}>Shifts</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {regularShifts.map((st) => (
                    <ShiftTile key={st.id} st={st} />
                  ))}
                </div>
              </div>
            )
          )}

          {/* Off day types */}
          {offDayShifts.length > 0 && (
            <div>
              <div style={sectionLabel}>Off Day Types</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {offDayShifts.map((st) => (
                  <ShiftTile key={st.id} st={st} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function RegularSchedulePanel({
  employee,
  orgId,
  shiftCodes,
  shiftCodeMap,
  focusAreas,
  certifications,
  onClose,
}: RegularSchedulePanelProps) {
  const [regularShifts, setRegularShifts] = useState<RegularShift[]>([]);
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
    db.fetchRegularShifts(orgId, employee.id, shiftCodeMap)
      .then((rows) => {
        const map: Record<number, string> = {};
        for (const rs of rows) {
          if (!(rs.dayOfWeek in map)) {
            map[rs.dayOfWeek] = rs.shiftLabel;
          }
        }
        setSchedule(map);
        setRegularShifts(rows);
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
        const existing = regularShifts.filter((rs) => rs.dayOfWeek === day);

        if (newLabel) {
          const sc = shiftCodes.find(s => s.label === newLabel);
          if (!sc) continue;
          await db.upsertRegularShift(employee.id, orgId, day, sc.id, todayKey);
        } else {
          for (const rs of existing) {
            await db.deleteRegularShift(employee.id, rs.dayOfWeek, rs.effectiveFrom);
          }
        }
      }
      toast.success("Regular schedule saved");
      onClose();
    } catch (err: any) {
      toast.error("Failed to save regular schedule");
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
