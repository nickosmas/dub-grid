"use client";

import React, { useMemo } from "react";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import { Employee, ShiftCategory, ShiftCode, FocusArea, DraftKind } from "@/types";
import { borderColor } from "@/lib/colors";

const DRAFT_BORDER_COLORS: Record<string, string> = {
  new: '#16A34A',
  modified: '#D97706',
  deleted: '#DC2626',
};

interface MonthViewProps {
  monthStart: Date;
  filteredEmployees: Employee[];
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  today: Date;
  focusAreas: FocusArea[];
  shiftCodes?: ShiftCode[];
  shiftCategories: ShiftCategory[];
  activeFocusArea?: number | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
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

export default function MonthView({
  monthStart,
  filteredEmployees,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  today,
  focusAreas,
  shiftCodes = [],
  shiftCategories,
  activeFocusArea = null,
  draftKindForKey,
}: MonthViewProps) {
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const cells = useMemo(() => buildMonthCells(monthStart), [monthStart]);
  const focusAreaNames = focusAreas.map((w) => w.name);

  const focusAreaColorMap = useMemo(() => {
    const map: Record<string, { bg: string; text: string }> = {};
    for (const w of focusAreas) map[w.name] = { bg: w.colorBg, text: w.colorText };
    return map;
  }, [focusAreas]);

  // Look up shift codes by ID so cross-focus-area shifts render in their own color
  const shiftCodeById = useMemo(() => {
    const map = new Map<number, ShiftCode>();
    for (const sc of shiftCodes) map.set(sc.id, sc);
    return map;
  }, [shiftCodes]);

  // Build a map of categoryId → category for fast lookup
  const categoryMap = useMemo(() => {
    const m = new Map<number, ShiftCategory>();
    for (const cat of shiftCategories) m.set(cat.id, cat);
    return m;
  }, [shiftCategories]);

  // Sort-order for a shift style: use its category's sortOrder, fall back to a high number
  const shiftSortOrder = (style: ShiftCode): number => {
    if (style.categoryId != null) {
      return categoryMap.get(style.categoryId)?.sortOrder ?? 99;
    }
    return 99;
  };

  return (
    <div>
      {/* Day-of-week column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginBottom: 4,
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              color: "var(--color-text-subtle)",
              padding: "4px 0",
            }}
          >
            {d.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          alignItems: "start",
        }}
      >
        {cells.map((date, i) => {
          if (!date) {
            return (
              <div
                key={`empty-${i}`}
                style={{
                  background: "transparent",
                  borderRadius: 10,
                  minHeight: 80,
                }}
              />
            );
          }

          const dateKey = formatDateKey(date);
          const isToday = dateKey === todayKey;

          // Per-category counts (keyed by categoryId)
          const categoryCounts = new Map<number, number>();
          const byFocusArea = new Map<
            string,
            { name: string; shift: string; style: ShiftCode; draftKind: DraftKind }[]
          >();

          filteredEmployees.forEach((emp) => {
            const combinedLabel = shiftForKey(emp.id, date);
            if (!combinedLabel || combinedLabel === "X" || combinedLabel === "OFF")
              return;

            const cellCodeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
            const primaryFa = focusAreas.find(fa => emp.focusAreaIds.includes(fa.id));
            const primaryFaName = primaryFa?.name;
            const shiftLabels = combinedLabel.split("/");
            shiftLabels.forEach((label, li) => {
              // Resolve by shift code ID first, then by label + focus area context
              const byId = cellCodeIds[li] != null ? shiftCodeById.get(cellCodeIds[li]) : undefined;
              const style = byId ?? getShiftStyle(label, primaryFaName);
              if (style.categoryId != null) {
                categoryCounts.set(
                  style.categoryId,
                  (categoryCounts.get(style.categoryId) ?? 0) + 1,
                );
              }
              if (!primaryFaName) return;
              const list = byFocusArea.get(primaryFaName) ?? [];
              const dk = draftKindForKey?.(emp.id, date) ?? null;
              list.push({ name: emp.name, shift: label, style, draftKind: dk });
              byFocusArea.set(primaryFaName, list);
            });
          });

          byFocusArea.forEach((list) =>
            list.sort((a, b) => shiftSortOrder(a.style) - shiftSortOrder(b.style)),
          );

          // Categories present on this day, in sort order
          const activeCats = shiftCategories
            .filter((cat) => (categoryCounts.get(cat.id) ?? 0) > 0)
            .sort((a, b) => a.sortOrder - b.sortOrder);

          const focusAreaSections = focusAreaNames.filter(
            (w) =>
              byFocusArea.has(w) &&
              (activeFocusArea === null || w === focusAreas.find(fa => fa.id === activeFocusArea)?.name),
          );

          return (
            <div
              key={dateKey}
              style={{
                background: isToday ? "#EFF6FF" : "#fff",
                border: isToday
                  ? "2px solid var(--color-today-text)"
                  : "1px solid var(--color-border)",
                borderRadius: 10,
                padding: "9px 10px 8px",
                minHeight: 90,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Date number + per-category coverage badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: isToday ? "var(--color-today-text)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: isToday ? "#fff" : "var(--color-text-secondary)",
                    flexShrink: 0,
                  }}
                >
                  {date.getDate()}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 3,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {activeCats.map((cat) => (
                    <span
                      key={cat.id}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: cat.color,
                        color: "var(--color-text-secondary)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 4,
                        padding: "1px 5px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cat.name} {fmtCount(categoryCounts.get(cat.id) ?? 0)}
                    </span>
                  ))}
                </div>
              </div>

              {focusAreaSections.length > 0 && (
                <div
                  style={{
                    height: 1,
                    background: "var(--color-border-light)",
                    marginBottom: 5,
                  }}
                />
              )}

              {/* Workers grouped by focus area */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {focusAreaSections.map((focusArea) => {
                  const workers = byFocusArea.get(focusArea)!;
                  const wc = focusAreaColorMap[focusArea] ?? {
                    bg: "#F1F5F9",
                    text: "#475569",
                  };
                  const abbr = focusArea
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase();
                  return (
                    <div key={focusArea}>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          background: wc.bg,
                          color: wc.text,
                          borderRadius: 3,
                          padding: "1px 5px",
                          marginBottom: 3,
                          display: "inline-block",
                        }}
                      >
                        {abbr}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {workers.map(({ name, shift, style: s, draftKind: dk }, ni) => (
                          <div
                            key={ni}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <div
                                key={ni}
                                style={{
                                  background: s.color,
                                  border: dk ? `2px dashed ${DRAFT_BORDER_COLORS[dk]}` : `1px solid ${borderColor(s.text)}`,
                                  borderRadius: 4,
                                  padding: dk ? "1px 5px" : "2px 6px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: s.text,
                                  opacity: dk === 'deleted' ? 0.5 : 1,
                                  textDecoration: dk === 'deleted' ? 'line-through' : 'none',
                                }}
                              >{shift}
                            </div>
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--color-text-secondary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
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
