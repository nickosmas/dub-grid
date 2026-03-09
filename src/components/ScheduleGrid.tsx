"use client";

import React, { memo, useMemo, useRef, useLayoutEffect, useState } from "react";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies, DailyTallies, Tally } from "@/lib/schedule-logic";
import { Employee, ShiftType, Wing, NoteType } from "@/types";

const DESIGNATION_COLORS: Record<string, { bg: string; text: string }> = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },      // Purple
  "CSN III": { bg: "#DBEAFE", text: "#1D4ED8" },  // Blue
  "CSN II": { bg: "#CCFBF1", text: "#0E7490" },   // Teal
  STAFF: { bg: "#F1F5F9", text: "#475569" },     // Slate
};
const DEFAULT_DESIG_COLOR = { bg: "#F1F5F9", text: "#94A3B8" };

interface ScheduleGridProps {
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  week1: Date[];
  week2: Date[];
  spanWeeks: 1 | 2;
  shiftForKey: (empId: string, date: Date) => string | null;
  getShiftStyle: (type: string) => ShiftType;
  handleCellClick: (emp: Employee, date: Date) => void;
  today: Date;
  highlightEmpIds?: Set<string>;
  wings: Wing[];
  shiftTypes: ShiftType[];
  isCellInteractive?: boolean;
  noteTypesForKey?: (empId: string, date: Date, wingName?: string) => NoteType[];
  activeWing?: string;
  isEditMode?: boolean;
}


interface SectionBlockProps {
  sectionName: string;
  exclusiveLabels: string[];
  employees: Employee[];
  weekDates: Date[];
  todayKey: string;
  shiftForKey: (empId: string, date: Date) => string | null;
  getShiftStyle: (type: string) => ShiftType;
  handleCellClick: (emp: Employee, date: Date) => void;
  colWidth: number;
  splitAtIndex?: number;
  highlightEmpIds?: Set<string>;
  shiftTypes: ShiftType[];
  isCellInteractive: boolean;
  noteTypesForKey?: (empId: string, date: Date, wingName?: string) => NoteType[];
}

const SectionBlock = memo(function SectionBlock({
  sectionName,
  exclusiveLabels,
  employees,
  weekDates,
  todayKey,
  shiftForKey,
  getShiftStyle,
  handleCellClick,
  colWidth,
  splitAtIndex,
  highlightEmpIds,
  shiftTypes,
  isCellInteractive,
  noteTypesForKey,
}: SectionBlockProps) {
  if (employees.length === 0) return null;

  const dailyTallies = useMemo(() => {
    return weekDates.map((date) =>
      computeDailyTallies(
        employees,
        date,
        shiftForKey,
        getShiftStyle,
        exclusiveLabels,
      ),
    );
  }, [weekDates, employees, shiftForKey, getShiftStyle, exclusiveLabels]);

  const renderTally = (tally: Tally) => {
    const entries = Object.entries(tally);
    if (entries.length === 0) return "-";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {entries.map(([label, count]) => (
          <div key={label} style={{ whiteSpace: "nowrap" }}>
            {label}: {count}
          </div>
        ))}
      </div>
    );
  };

  // Compute which count rows to show based on shift types for this wing
  const sectionShiftTypes = shiftTypes.filter(
    (st) => st.wingName === sectionName,
  );
  const showDayCount = sectionShiftTypes.some((st) => st.countsTowardDay);
  const showEveCount = sectionShiftTypes.some((st) => st.countsTowardEve);
  const showNightCount = sectionShiftTypes.some((st) => st.countsTowardNight);

  const gridTemplate = `220px repeat(${weekDates.length}, ${colWidth}px)`;

  const rowGrid: React.CSSProperties = {
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section label */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-text-secondary)",
          marginBottom: 10,
          paddingLeft: 4,
        }}
      >
        {sectionName}
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          overflowX: "auto",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            minWidth: "max-content",
          }}
        >
          {/* Header row */}
          <div
            style={{ ...rowGrid, borderBottom: "2px solid var(--color-dark)" }}
          >
            <div
              style={{
                position: "sticky",
                left: 0,
                zIndex: 2,
                background: "var(--color-bg)",
                padding: "10px 14px",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.08em",
                borderRight: "1px solid var(--color-border-light)",
                boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
              }}
            >
              STAFF NAME
            </div>
            {weekDates.map((date, i) => {
              const key = formatDateKey(date);
              const isToday = key === todayKey;
              const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
              return (
                <div
                  key={key}
                  style={{
                    textAlign: "center",
                    padding: "8px 0",
                    background: isToday
                      ? "var(--color-today-bg)"
                      : "transparent",
                    borderLeft: isSplit
                      ? "2px solid var(--color-dark)"
                      : "1px solid var(--color-border-light)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: isToday
                        ? "var(--color-today-text)"
                        : "var(--color-text-faint)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {DAY_LABELS[date.getDay()]}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: isToday
                        ? "var(--color-today-text)"
                        : "var(--color-text-secondary)",
                      lineHeight: 1.2,
                      marginTop: 1,
                    }}
                  >
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Employee rows */}
          {employees.map((emp, ri) => {
            const isHighlighted =
              highlightEmpIds && highlightEmpIds.size > 0
                ? highlightEmpIds.has(emp.id)
                : true;
            const rowBg = ri % 2 === 0 ? "#fff" : "var(--color-row-alt)";
            const dc =
              DESIGNATION_COLORS[emp.designation] ?? DEFAULT_DESIG_COLOR;

            return (
              <div
                key={emp.id}
                style={{
                  ...rowGrid,
                  borderTop:
                    ri === 0 ? "none" : "1px solid var(--color-border-light)",
                  background: rowBg,
                  opacity: isHighlighted ? 1 : 0.35,
                  transition: "opacity 0.15s",
                  alignItems: "stretch",
                }}
              >
                {/* Name cell */}
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    background: rowBg,
                    padding: "7px 12px 7px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    minWidth: 0,
                    borderRight: "1px solid var(--color-border-light)",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--color-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.name}
                      </span>
                      {emp.fteWeight < 1 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: "var(--color-border-light)",
                            color: "var(--color-text-muted)",
                            padding: "1px 4px",
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        >
                          {emp.fteWeight}
                        </span>
                      )}
                    </div>
                    {emp.roles.length > 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-subtle)",
                          marginTop: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.roles.join(", ")}
                      </div>
                    )}
                  </div>
                  {emp.designation && emp.designation !== "—" && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: dc.bg,
                        color: dc.text,
                        padding: "2px 7px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        letterSpacing: "0.01em",
                      }}
                    >
                      {emp.designation}
                    </span>
                  )}
                </div>

                {/* Shift cells */}
                {weekDates.map((date, di) => {
                  const dateKey = formatDateKey(date);
                  const isToday = dateKey === todayKey;
                  const isSplit =
                    splitAtIndex !== undefined && di === splitAtIndex;
                  const shiftType = shiftForKey(emp.id, date);
                  const noteTypes = noteTypesForKey?.(emp.id, date, sectionName) ?? [];
                  const shiftStyle = shiftType
                    ? getShiftStyle(shiftType)
                    : null;
                  const isCrossWing = shiftType
                    ? exclusiveLabels.length > 0 &&
                      !exclusiveLabels.includes(shiftType) &&
                      shiftType !== "X" &&
                      shiftStyle !== null
                    : false;

                  return (
                    <div
                      key={dateKey}
                      onClick={() => {
                        if (isCellInteractive) handleCellClick(emp, date);
                      }}
                      style={{
                        height: 48,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        borderLeft: isSplit
                          ? "2px solid var(--color-dark)"
                          : "1px solid var(--color-border-light)",
                        background: isToday
                          ? "var(--color-today-bg)"
                          : "transparent",
                        cursor: isCellInteractive ? "pointer" : "default",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isCellInteractive) return;
                        e.currentTarget.style.background =
                          "var(--color-today-bg)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isCellInteractive) return;
                        e.currentTarget.style.background = isToday
                          ? "var(--color-today-bg)"
                          : rowBg;
                      }}
                    >
                      {shiftType && shiftType !== "OFF" ? (
                        (() => {
                          const labels = shiftType.split("/");
                          if (labels.length === 1) {
                            const label = labels[0];
                            const style = getShiftStyle(label);
                            const isCross =
                              exclusiveLabels.length > 0 &&
                              !exclusiveLabels.includes(label) &&
                              label !== "X" &&
                              style !== null;
                            return (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "0.625rem",
                                  right: "0.625rem",
                                  bottom: "0.625rem",
                                  left: "0.625rem",
                                  background: style.color,
                                  border: `1px solid ${style.border}`,
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: style.text,
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                  opacity: isCross ? 0.35 : 1,
                                  filter: isCross ? "grayscale(0.6)" : "none",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {label}
                              </div>
                            );
                          }

                          const firstStyle = getShiftStyle(labels[0]);
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: "0.625rem",
                                right: "0.625rem",
                                bottom: "0.625rem",
                                left: "0.625rem",
                                display: "flex",
                                borderRadius: 6,
                                overflow: "hidden",
                                border: `1px solid ${firstStyle?.border || "var(--color-border)"}`,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                cursor: "pointer",
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
                                      fontSize: 10,
                                      fontWeight: 800,
                                      opacity: isCross ? 0.35 : 1,
                                      filter: isCross ? "grayscale(0.6)" : "none",
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
                            width: 16,
                            height: 2,
                            background:
                              shiftType === "OFF"
                                ? "var(--color-border)"
                                : "var(--color-border-light)",
                            borderRadius: 2,
                          }}
                        />
                      )}

                      {noteTypes.length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: 5,
                            right: 5,
                            display: "flex",
                            gap: 2,
                          }}
                        >
                          {noteTypes.includes("readings") && (
                            <div
                              title="Readings"
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: "#EF4444",
                                border: "1px solid #fff",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {noteTypes.includes("shower") && (
                            <div
                              title="Shower"
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: "#1E293B",
                                border: "1px solid #fff",
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Count rows */}
          {(showDayCount || showEveCount || showNightCount) && (
            <>
              {showDayCount && (
                <div
                  style={{
                    ...rowGrid,
                    borderTop: "2px solid var(--color-dark)",
                    background: "#F1F5F9",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: "#F1F5F9",
                      padding: "6px 14px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-text-secondary)",
                      letterSpacing: "0.05em",
                      display: "flex",
                      alignItems: "center",
                      borderRight: "1px solid var(--color-border)",
                      boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                    }}
                  >
                    TALLY DAY
                  </div>
                  {dailyTallies.map((tallies, i) => {
                    const hasCount = Object.keys(tallies.day).length > 0;
                    return (
                      <div
                        key={i}
                        style={{
                          textAlign: "center",
                          padding: "8px 4px",
                          borderLeft:
                            splitAtIndex !== undefined && i === splitAtIndex
                              ? "2px solid var(--color-dark)"
                              : "1px solid var(--color-border)",
                          fontSize: 10,
                          lineHeight: 1.3,
                          fontWeight: 700,
                          color: hasCount
                            ? "#1E3A8A"
                            : "var(--color-text-faint)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {renderTally(tallies.day)}
                      </div>
                    );
                  })}
                </div>
              )}
              {showEveCount && (
                <div
                  style={{
                    ...rowGrid,
                    background: "#F1F5F9",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: "#F1F5F9",
                      padding: "6px 14px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-text-secondary)",
                      letterSpacing: "0.05em",
                      display: "flex",
                      alignItems: "center",
                      borderRight: "1px solid var(--color-border)",
                      boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                    }}
                  >
                    TALLY EVE
                  </div>
                  {dailyTallies.map((tallies, i) => {
                    const hasCount = Object.keys(tallies.eve).length > 0;
                    return (
                      <div
                        key={i}
                        style={{
                          textAlign: "center",
                          padding: "8px 4px",
                          borderLeft:
                            splitAtIndex !== undefined && i === splitAtIndex
                              ? "2px solid var(--color-dark)"
                              : "1px solid var(--color-border)",
                          fontSize: 10,
                          lineHeight: 1.3,
                          fontWeight: 700,
                          color: hasCount
                            ? "#9A3412"
                            : "var(--color-text-faint)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {renderTally(tallies.eve)}
                      </div>
                    );
                  })}
                </div>
              )}
              {showNightCount && (
                <div
                  style={{
                    ...rowGrid,
                    background: "#F1F5F9",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: "#F1F5F9",
                      padding: "6px 14px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-text-secondary)",
                      letterSpacing: "0.05em",
                      display: "flex",
                      alignItems: "center",
                      borderRight: "1px solid var(--color-border)",
                      boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                    }}
                  >
                    TALLY NIGHT
                  </div>
                  {dailyTallies.map((tallies, i) => {
                    const hasCount = Object.keys(tallies.night).length > 0;
                    return (
                      <div
                        key={i}
                        style={{
                          textAlign: "center",
                          padding: "8px 4px",
                          borderLeft:
                            splitAtIndex !== undefined && i === splitAtIndex
                              ? "2px solid var(--color-dark)"
                              : "1px solid var(--color-border)",
                          fontSize: 10,
                          lineHeight: 1.3,
                          fontWeight: 700,
                          color: hasCount
                            ? "#5B21B6"
                            : "var(--color-text-faint)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {renderTally(tallies.night)}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default function ScheduleGrid({
  filteredEmployees,
  allEmployees,
  week1,
  week2,
  spanWeeks,
  shiftForKey,
  getShiftStyle,
  handleCellClick,
  today,
  highlightEmpIds,
  wings,
  shiftTypes,
  isCellInteractive = true,
  noteTypesForKey,
  activeWing = "All",
  isEditMode = true,
}: ScheduleGridProps) {
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  
  const sections = useMemo(() => {
    const allNames = wings.map((w) => w.name);
    if (activeWing === "All") return allNames;
    return allNames.filter((name) => name === activeWing);
  }, [wings, activeWing]);

  const allDates = spanWeeks === 2 ? [...week1, ...week2] : week1;
  const splitAtIndex = spanWeeks === 2 ? 7 : undefined;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const numDays = allDates.length;
  const colWidth =
    containerWidth > 0
      ? Math.max(50, Math.floor((containerWidth - 220) / numDays))
      : spanWeeks === 2
        ? 72
        : 84;

  // For each section, compute which shift labels exclusively belong to it
  // (shift types where wingName matches only this section and no other)
  const exclusiveLabelsPerSection = useMemo(() => {
    return Object.fromEntries(
      sections.map((section) => {
        const labels = shiftTypes
          .filter((st) => st.wingName === section)
          .map((st) => st.label);
        return [section, labels];
      }),
    );
  }, [sections, shiftTypes]);

  // Shift labels that are "general" — not tied to any specific wing
  const generalShiftLabels = useMemo(
    () =>
      new Set(
        shiftTypes
          .filter((st) => st.isGeneral || !st.wingName)
          .map((st) => st.label),
      ),
    [shiftTypes],
  );

  const renderedSections = sections.filter(section => {
    const exclusiveLabels = exclusiveLabelsPerSection[section] ?? [];
    const rawHomeEmps = filteredEmployees.filter((e) => e.wings.includes(section));
    const homeEmps = isEditMode
      ? rawHomeEmps
      : rawHomeEmps.filter((emp) =>
          allDates.some((date) => {
            const shift = shiftForKey(emp.id, date);
            return (
              shift !== null &&
              shift !== "OFF" &&
              (exclusiveLabels.includes(shift) || generalShiftLabels.has(shift))
            );
          }),
        );
    const guestEmps = allEmployees.filter(
      (e) =>
        !e.wings.includes(section) &&
        allDates.some((date) => {
          const shift = shiftForKey(e.id, date);
          return shift !== null && exclusiveLabels.includes(shift);
        }),
    );
    return [...homeEmps, ...guestEmps].length > 0;
  });

  if (renderedSections.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          background: "#fff",
          borderRadius: 12,
          border: "1px dashed var(--color-border)",
          color: "var(--color-text-muted)",
          marginTop: 34,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          No shifts found for this period
        </div>
        <div style={{ fontSize: 13 }}>
          {isEditMode 
            ? "No employees are assigned to this wing. Add employees in the Staff view."
            : "No shifts have been published for this period yet."}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", maxWidth: "100%" }}>
      {renderedSections.map((section) => {
        const exclusiveLabels = exclusiveLabelsPerSection[section] ?? [];
        const rawHomeEmps = filteredEmployees.filter((e) =>
          e.wings.includes(section),
        );
        const homeEmps = isEditMode
          ? rawHomeEmps
          : rawHomeEmps.filter((emp) =>
              allDates.some((date) => {
                const shift = shiftForKey(emp.id, date);
                return (
                  shift !== null &&
                  shift !== "OFF" &&
                  (exclusiveLabels.includes(shift) ||
                    generalShiftLabels.has(shift))
                );
              }),
            );
        const guestEmps = allEmployees.filter(
          (e) =>
            !e.wings.includes(section) &&
            allDates.some((date) => {
              const shift = shiftForKey(e.id, date);
              return shift !== null && exclusiveLabels.includes(shift);
            }),
        );
        const sectionEmps = [...homeEmps, ...guestEmps];
        return (
          <SectionBlock
            key={section}
            sectionName={section}
            exclusiveLabels={exclusiveLabels}
            employees={sectionEmps}
            weekDates={allDates}
            todayKey={todayKey}
            shiftForKey={shiftForKey}
            getShiftStyle={getShiftStyle}
            handleCellClick={handleCellClick}
            colWidth={colWidth}
            splitAtIndex={splitAtIndex}
            highlightEmpIds={highlightEmpIds}
            shiftTypes={shiftTypes}
            isCellInteractive={isCellInteractive}
            noteTypesForKey={noteTypesForKey}
          />
        );
      })}
    </div>
  );
}
