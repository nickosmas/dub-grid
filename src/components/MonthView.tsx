"use client";

import React, { useMemo } from "react";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import { Employee, ShiftType, Wing } from "@/types";

interface MonthViewProps {
  monthStart: Date;
  filteredEmployees: Employee[];
  shiftForKey: (empId: number, date: Date) => string | null;
  getShiftStyle: (type: string) => ShiftType;
  today: Date;
  wings: Wing[];
}

function buildMonthCells(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function fmtCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[0] + (parts[1] ? " " + parts[1][0] + "." : "");
}

// Day < Evening < Night < everything else
function shiftSortOrder(style: ShiftType): number {
  if (style.countsTowardDay && !style.countsTowardEve && !style.countsTowardNight) return 0;
  if (style.countsTowardEve && !style.countsTowardNight) return 1;
  if (style.countsTowardNight) return 2;
  return 3;
}

export default function MonthView({
  monthStart,
  filteredEmployees,
  shiftForKey,
  getShiftStyle,
  today,
  wings,
}: MonthViewProps) {
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const cells = useMemo(() => buildMonthCells(monthStart), [monthStart]);
  // Ordered wing names (as they appear in wings table)
  const wingNames = wings.map((w) => w.name);
  // Wing color map
  const wingColorMap = useMemo(() => {
    const map: Record<string, { bg: string; text: string }> = {};
    for (const w of wings) map[w.name] = { bg: w.colorBg, text: w.colorText };
    return map;
  }, [wings]);

  return (
    <div>
      {/* Day-of-week column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 4 }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: "var(--color-text-subtle)", padding: "4px 0" }}>
            {d.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, alignItems: "start" }}>
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`empty-${i}`} style={{ background: "transparent", borderRadius: 10, minHeight: 80 }} />;
          }

          const dateKey = formatDateKey(date);
          const isToday = dateKey === todayKey;

          let dayCount = 0, eveCount = 0, nightCount = 0;
          const byWing = new Map<string, { name: string; shift: string; style: ShiftType }[]>();

          filteredEmployees.forEach((emp) => {
            const shiftLabel = shiftForKey(emp.id, date);
            if (!shiftLabel || shiftLabel === "X" || shiftLabel === "OFF") return;
            const style = getShiftStyle(shiftLabel);
            if (style.countsTowardDay) dayCount += emp.fteWeight;
            if (style.countsTowardEve) eveCount += emp.fteWeight;
            if (style.countsTowardNight) nightCount += emp.fteWeight;
            const primaryWing = emp.wings[0];
            if (!primaryWing) return;
            const list = byWing.get(primaryWing) ?? [];
            list.push({ name: emp.name, shift: shiftLabel, style });
            byWing.set(primaryWing, list);
          });

          byWing.forEach((list) =>
            list.sort((a, b) => shiftSortOrder(a.style) - shiftSortOrder(b.style)),
          );

          // Preserve wing table order; only show wings that have workers on this day
          const wingSections = wingNames.filter((w) => byWing.has(w));

          return (
            <div
              key={dateKey}
              style={{
                background: isToday ? "#EFF6FF" : "#fff",
                border: isToday ? "2px solid var(--color-today-text)" : "1px solid var(--color-border)",
                borderRadius: 10, padding: "9px 10px 8px", minHeight: 90,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Date number + coverage badges */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: isToday ? "var(--color-today-text)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                    color: isToday ? "#fff" : "var(--color-text-secondary)", flexShrink: 0,
                  }}
                >
                  {date.getDate()}
                </div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {dayCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #93C5FD", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>
                      D {fmtCount(dayCount)}
                    </span>
                  )}
                  {eveCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#FFF7ED", color: "#9A3412", border: "1px solid #FCA5A5", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>
                      E {fmtCount(eveCount)}
                    </span>
                  )}
                  {nightCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#F5F3FF", color: "#4C1D95", border: "1px solid #C4B5FD", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>
                      N {fmtCount(nightCount)}
                    </span>
                  )}
                </div>
              </div>

              {wingSections.length > 0 && (
                <div style={{ height: 1, background: "var(--color-border-light)", marginBottom: 5 }} />
              )}

              {/* Workers grouped by wing */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {wingSections.map((wing) => {
                  const workers = byWing.get(wing)!;
                  const wc = wingColorMap[wing] ?? { bg: "#F1F5F9", text: "#475569" };
                  // Abbreviate the wing name to first letters of each word
                  const abbr = wing.split(" ").map((p) => p[0]).join("").toUpperCase();
                  return (
                    <div key={wing}>
                      <div
                        style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                          background: wc.bg, color: wc.text, borderRadius: 3,
                          padding: "1px 5px", marginBottom: 3, display: "inline-block",
                        }}
                      >
                        {abbr}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {workers.map(({ name, shift, style: s }, ni) => (
                          <div key={ni} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span
                              style={{
                                fontSize: 9, fontWeight: 700, background: s.color, color: s.text,
                                border: `1px solid ${s.border}`, borderRadius: 3,
                                padding: "0 4px", lineHeight: "15px", flexShrink: 0,
                              }}
                            >
                              {shift}
                            </span>
                            <span style={{ fontSize: 10.5, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {shortName(name)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
