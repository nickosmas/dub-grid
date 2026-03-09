"use client";

import { useEffect, useMemo } from "react";
import { Employee, ShiftType, Wing } from "@/types";
import { addDays, formatDateKey, formatDate } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/constants";
import { computeDailyTallies } from "@/lib/schedule-logic";
import { PrintConfig } from "./PrintOptionsModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DESIGNATION_COLORS: Record<string, { bg: string; text: string }> = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },
  "CSN III": { bg: "#DBEAFE", text: "#1D4ED8" },
  "CSN II": { bg: "#CCFBF1", text: "#0E7490" },
  STAFF: { bg: "#F1F5F9", text: "#475569" },
};
const DEFAULT_DESIG_COLOR = { bg: "#F1F5F9", text: "#94A3B8" };

// ── Per-section print grid ─────────────────────────────────────────────────

interface PrintSectionProps {
  sectionName: string;
  exclusiveLabels: string[];
  employees: Employee[];
  dates: Date[];
  shiftForKey: (empId: string, date: Date) => string | null;
  getShiftStyle: (type: string) => ShiftType;
  shiftTypes: ShiftType[];
  splitAtIndex?: number;
  fontSize: number;
}

function PrintSection({
  sectionName,
  exclusiveLabels,
  employees,
  dates,
  shiftForKey,
  getShiftStyle,
  shiftTypes,
  splitAtIndex,
  fontSize,
}: PrintSectionProps) {
  if (employees.length === 0) return null;

  const sectionShiftTypes = shiftTypes.filter((st) => st.wingName === sectionName);
  const showDayCount = sectionShiftTypes.some((st) => st.countsTowardDay);
  const showEveCount = sectionShiftTypes.some((st) => st.countsTowardEve);
  const showNightCount = sectionShiftTypes.some((st) => st.countsTowardNight);

  const dailyTallies = useMemo(
    () => dates.map((date) => computeDailyTallies(employees, date, shiftForKey, getShiftStyle, exclusiveLabels)),
    [dates, employees, shiftForKey, getShiftStyle, exclusiveLabels],
  );

  // em-based name column; day columns fill the rest equally
  const nameColEm = 13;
  const gridTemplate = `${nameColEm}em repeat(${dates.length}, 1fr)`;

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: gridTemplate,
  };

  const cellH = `${fontSize * 3.4}px`;
  const tallyH = `${fontSize * 2.8}px`;

  return (
    <div style={{ marginBottom: "1.4em", breakInside: "avoid" }}>
      <div
        style={{
          fontSize: "1.3em",
          fontWeight: 700,
          color: "#1E293B",
          marginBottom: "0.5em",
          paddingLeft: "0.3em",
        }}
      >
        {sectionName}
      </div>

      <div
        style={{
          border: "1px solid #CBD5E1",
          borderRadius: 6,
          overflow: "hidden",
          breakInside: "avoid",
        }}
      >
        {/* Header row */}
        <div style={{ ...rowStyle, borderBottom: "2px solid #0F172A", background: "#F8FAFC" }}>
          <div style={{ padding: "0.4em 0.8em", fontWeight: 700, fontSize: "0.85em", color: "#94A3B8", letterSpacing: "0.06em" }}>
            STAFF NAME
          </div>
          {dates.map((date, i) => {
            const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
            return (
              <div
                key={formatDateKey(date)}
                style={{
                  textAlign: "center",
                  padding: "0.35em 0",
                  borderLeft: isSplit ? "2px solid #0F172A" : "1px solid #E2E8F0",
                }}
              >
                <div style={{ fontSize: "0.75em", fontWeight: 600, color: "#94A3B8", letterSpacing: "0.04em" }}>
                  {DAY_LABELS[date.getDay()]}
                </div>
                <div style={{ fontSize: "1em", fontWeight: 700, color: "#1E293B", lineHeight: 1.1, marginTop: "0.1em" }}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Employee rows */}
        {employees.map((emp, ri) => {
          const rowBg = ri % 2 === 0 ? "#fff" : "#FAFBFC";
          const dc = DESIGNATION_COLORS[emp.designation] ?? DEFAULT_DESIG_COLOR;

          return (
            <div
              key={emp.id}
              style={{
                ...rowStyle,
                background: rowBg,
                borderTop: ri === 0 ? "none" : "1px solid #F1F5F9",
                alignItems: "stretch",
              }}
            >
              {/* Name cell */}
              <div
                style={{
                  padding: "0.3em 0.6em 0.3em 0.8em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.4em",
                  minWidth: 0,
                  height: cellH,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#1E293B",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: `${nameColEm - 5}em`,
                      }}
                    >
                      {emp.name}
                    </span>
                    {emp.fteWeight < 1 && (
                      <span
                        style={{
                          fontSize: "0.8em",
                          fontWeight: 700,
                          background: "#F1F5F9",
                          color: "#64748B",
                          padding: "0.1em 0.3em",
                          borderRadius: 3,
                          flexShrink: 0,
                        }}
                      >
                        {emp.fteWeight}
                      </span>
                    )}
                  </div>
                  {emp.roles.length > 0 && (
                    <div style={{ fontSize: "0.8em", color: "#94A3B8", marginTop: "0.1em", whiteSpace: "nowrap" }}>
                      {emp.roles.join(", ")}
                    </div>
                  )}
                </div>
                {emp.designation && emp.designation !== "—" && (
                  <span
                    style={{
                      fontSize: "0.8em",
                      fontWeight: 700,
                      background: dc.bg,
                      color: dc.text,
                      padding: "0.15em 0.5em",
                      borderRadius: 12,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {emp.designation}
                  </span>
                )}
              </div>

              {/* Shift cells */}
              {dates.map((date, di) => {
                const isSplit = splitAtIndex !== undefined && di === splitAtIndex;
                const shiftType = shiftForKey(emp.id, date);
                const shiftStyle = shiftType ? getShiftStyle(shiftType) : null;

                return (
                  <div
                    key={formatDateKey(date)}
                    style={{
                      height: cellH,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      borderLeft: isSplit ? "2px solid #0F172A" : "1px solid #F1F5F9",
                    }}
                  >
                    {shiftType && shiftType !== "OFF" ? (
                      (() => {
                        const labels = shiftType.split("/");
                        if (labels.length === 1) {
                          const style = getShiftStyle(labels[0]);
                          const isCross =
                            exclusiveLabels.length > 0 &&
                            !exclusiveLabels.includes(labels[0]) &&
                            labels[0] !== "X" &&
                            style !== null;
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: "0.5em",
                                right: "0.4em",
                                bottom: "0.5em",
                                left: "0.4em",
                                background: style.color,
                                border: `1px solid ${style.border}`,
                                borderRadius: 4,
                                fontWeight: 700,
                                color: style.text,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: isCross ? 0.35 : 1,
                              }}
                            >
                              {labels[0]}
                            </div>
                          );
                        }
                        const firstStyle = getShiftStyle(labels[0]);
                        return (
                          <div
                            style={{
                              position: "absolute",
                              top: "0.5em",
                              right: "0.4em",
                              bottom: "0.5em",
                              left: "0.4em",
                              display: "flex",
                              borderRadius: 4,
                              overflow: "hidden",
                              border: `1px solid ${firstStyle?.border || "#CBD5E1"}`,
                            }}
                          >
                            {labels.map((label, li) => {
                              const style = getShiftStyle(label);
                              const isCross =
                                exclusiveLabels.length > 0 &&
                                !exclusiveLabels.includes(label) &&
                                label !== "X" &&
                                style !== null;
                              return (
                                <div
                                  key={li}
                                  style={{
                                    flex: 1,
                                    background: style.color,
                                    color: style.text,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 800,
                                    fontSize: "0.85em",
                                    opacity: isCross ? 0.35 : 1,
                                    borderRight:
                                      li < labels.length - 1
                                        ? `1px solid ${style.border}`
                                        : "none",
                                  }}
                                >
                                  {label}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : (
                      <div
                        style={{
                          width: "1em",
                          height: "0.18em",
                          background: shiftType === "OFF" ? "#CBD5E1" : "#E2E8F0",
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Tally rows */}
        {(showDayCount || showEveCount || showNightCount) && (
          <>
            {showDayCount && (
              <TallyRow
                label="TALLY DAY"
                color="#1E3A8A"
                gridTemplate={gridTemplate}
                height={tallyH}
                splitAtIndex={splitAtIndex}
                dailyTallies={dailyTallies.map((t) => t.day)}
                isFirst
              />
            )}
            {showEveCount && (
              <TallyRow
                label="TALLY EVE"
                color="#9A3412"
                gridTemplate={gridTemplate}
                height={tallyH}
                splitAtIndex={splitAtIndex}
                dailyTallies={dailyTallies.map((t) => t.eve)}
              />
            )}
            {showNightCount && (
              <TallyRow
                label="TALLY NIGHT"
                color="#5B21B6"
                gridTemplate={gridTemplate}
                height={tallyH}
                splitAtIndex={splitAtIndex}
                dailyTallies={dailyTallies.map((t) => t.night)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TallyRow({
  label,
  color,
  gridTemplate,
  height,
  splitAtIndex,
  dailyTallies,
  isFirst,
}: {
  label: string;
  color: string;
  gridTemplate: string;
  height: string;
  splitAtIndex?: number;
  dailyTallies: Record<string, number>[];
  isFirst?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        background: "#F1F5F9",
        borderTop: isFirst ? "2px solid #0F172A" : "1px solid #E2E8F0",
      }}
    >
      <div
        style={{
          padding: "0.3em 0.8em",
          fontSize: "0.8em",
          fontWeight: 700,
          color: "#1E293B",
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          height,
        }}
      >
        {label}
      </div>
      {dailyTallies.map((tally, i) => {
        const entries = Object.entries(tally);
        const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
        return (
          <div
            key={i}
            style={{
              textAlign: "center",
              padding: "0.2em 0.2em",
              borderLeft: isSplit ? "2px solid #0F172A" : "1px solid #E2E8F0",
              fontSize: "0.8em",
              fontWeight: 700,
              color: entries.length > 0 ? color : "#CBD5E1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.2,
              height,
            }}
          >
            {entries.length === 0
              ? "—"
              : entries.map(([lbl, cnt]) => (
                  <div key={lbl} style={{ whiteSpace: "nowrap" }}>
                    {lbl}: {cnt}
                  </div>
                ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Main PrintScheduleView ──────────────────────────────────────────────────

const EXCLUDED_LEGEND = new Set(["OFF", "0.3"]);

interface PrintScheduleViewProps {
  orgName?: string;
  weekStart: Date;
  config: PrintConfig;
  employees: Employee[];
  allEmployees: Employee[];
  wings: Wing[];
  shiftTypes: ShiftType[];
  shiftForKey: (empId: string, date: Date) => string | null;
  getShiftStyle: (type: string) => ShiftType;
  onClose: () => void;
}

export default function PrintScheduleView({
  orgName,
  weekStart,
  config,
  employees,
  allEmployees,
  wings,
  shiftTypes,
  shiftForKey,
  getShiftStyle,
  onClose,
}: PrintScheduleViewProps) {
  const { fontSize, selectedWings, spanWeeks } = config;

  // Build date array
  const dates = useMemo(() => {
    if (spanWeeks === "month") {
      const year = weekStart.getFullYear();
      const month = weekStart.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) =>
        new Date(year, month, i + 1),
      );
    }
    return Array.from({ length: spanWeeks * 7 }, (_, i) =>
      addDays(weekStart, i),
    );
  }, [weekStart, spanWeeks]);

  const splitAtIndex = spanWeeks === 2 ? 7 : undefined;

  // Date range label for header
  const dateRangeLabel = useMemo(() => {
    if (spanWeeks === "month") {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, spanWeeks * 7 - 1))}`;
  }, [weekStart, spanWeeks]);

  // Filter wings to print
  const printWings = useMemo(
    () =>
      wings.filter(
        (w) =>
          selectedWings.length === 0 || selectedWings.includes(w.name),
      ),
    [wings, selectedWings],
  );

  // Exclusive labels per section
  const exclusiveLabelsPerSection = useMemo(() => {
    return Object.fromEntries(
      printWings.map((w) => [
        w.name,
        shiftTypes.filter((st) => st.wingName === w.name).map((st) => st.label),
      ]),
    );
  }, [printWings, shiftTypes]);

  // General shift labels (not wing-specific)
  const generalShiftLabels = useMemo(
    () =>
      new Set(
        shiftTypes
          .filter((st) => st.isGeneral || !st.wingName)
          .map((st) => st.label),
      ),
    [shiftTypes],
  );

  // Print trigger + cleanup
  useEffect(() => {
    const onAfterPrint = () => onClose();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [onClose]);

  function handlePrint() {
    window.print();
  }

  const legendItems = shiftTypes.filter((s) => !EXCLUDED_LEGEND.has(s.label));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Screen-only controls bar */}
      <div
        className="print-view-controls"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid #E2E8F0",
          background: "#F8FAFC",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          className="dg-btn dg-btn-secondary"
          style={{ padding: "7px 14px" }}
        >
          ← Back
        </button>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#1E293B",
          }}
        >
          Print Preview — {dateRangeLabel}
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "#94A3B8",
            }}
          >
            Font: {fontSize}px · {spanWeeks === "month" ? "Month" : `${spanWeeks}W`} · {selectedWings.length === wings.length ? "All wings" : selectedWings.join(", ")}
          </span>
          <button
            onClick={handlePrint}
            className="dg-btn dg-btn-primary"
            style={{ padding: "8px 18px" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 5 }}
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Scrollable preview area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px",
          background: "#CBD5E1",
        }}
      >
        {/* Paper simulation on screen */}
        <div
          className="print-schedule-content"
          style={{
            background: "#fff",
            fontSize: `${fontSize}px`,
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            padding: "0.6in",
            maxWidth: "none",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            borderRadius: 4,
            minWidth: "fit-content",
          }}
        >
          {/* Print header */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "1.2em",
              paddingBottom: "0.6em",
              borderBottom: "2px solid #0F172A",
            }}
          >
            <div>
              {orgName && (
                <div
                  style={{
                    fontSize: "1.8em",
                    fontWeight: 800,
                    color: "#0F172A",
                    lineHeight: 1.1,
                  }}
                >
                  {orgName}
                </div>
              )}
              <div
                style={{
                  fontSize: "1.2em",
                  fontWeight: 600,
                  color: "#64748B",
                  marginTop: orgName ? "0.2em" : 0,
                }}
              >
                Schedule — {dateRangeLabel}
              </div>
            </div>
            <div
              style={{
                fontSize: "0.9em",
                color: "#94A3B8",
                textAlign: "right",
              }}
            >
              Printed {new Date().toLocaleDateString()}
            </div>
          </div>

          {/* Wing sections */}
          {printWings.map((wing) => {
            const exclusiveLabels = exclusiveLabelsPerSection[wing.name] ?? [];
            const homeEmps = employees.filter((e) => e.wings.includes(wing.name));
            const guestEmps = allEmployees.filter(
              (e) =>
                !e.wings.includes(wing.name) &&
                dates.some((date) => {
                  const shift = shiftForKey(e.id, date);
                  return shift !== null && exclusiveLabels.includes(shift);
                }),
            );
            const sectionEmps = [...homeEmps, ...guestEmps];
            if (sectionEmps.length === 0) return null;

            return (
              <PrintSection
                key={wing.name}
                sectionName={wing.name}
                exclusiveLabels={exclusiveLabels}
                employees={sectionEmps}
                dates={dates}
                shiftForKey={shiftForKey}
                getShiftStyle={getShiftStyle}
                shiftTypes={shiftTypes}
                splitAtIndex={splitAtIndex}
                fontSize={fontSize}
              />
            );
          })}

          {/* Legend */}
          {legendItems.length > 0 && (
            <div
              style={{
                marginTop: "1.5em",
                paddingTop: "0.8em",
                borderTop: "1px solid #E2E8F0",
              }}
            >
              <div
                style={{
                  fontSize: "1em",
                  fontWeight: 700,
                  color: "#1E293B",
                  marginBottom: "0.7em",
                }}
              >
                Shift Code Key
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(10em, 1fr))",
                  gap: "0.5em 1.5em",
                }}
              >
                {legendItems.map((s) => (
                  <div
                    key={s.label}
                    style={{ display: "flex", alignItems: "center", gap: "0.5em" }}
                  >
                    <span
                      style={{
                        background: s.color,
                        border: `1px solid ${s.border}`,
                        color: s.text,
                        borderRadius: 4,
                        padding: "0.15em 0.5em",
                        fontSize: "0.9em",
                        fontWeight: 700,
                        flexShrink: 0,
                        minWidth: "2.5em",
                        textAlign: "center",
                      }}
                    >
                      {s.label}
                    </span>
                    <span style={{ fontSize: "0.9em", color: "#64748B" }}>
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
