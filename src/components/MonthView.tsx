"use client";

import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import { Employee, ShiftCategory, ShiftCode, FocusArea, DraftKind } from "@/types";
import { borderColor, DRAFT_BORDER_COLORS } from "@/lib/colors";

interface MonthViewProps {
  monthStart: Date;
  filteredEmployees: Employee[];
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  isAbsenceForKey?: (empId: string, date: Date) => boolean;
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  today: Date;
  focusAreas: FocusArea[];
  shiftCodes?: ShiftCode[];
  shiftCategories: ShiftCategory[];
  activeFocusArea?: number | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
}

type DayCellData = {
  date: Date;
  dateKey: string;
  isToday: boolean;
  categoryCounts: Map<number, number>;
  byFocusArea: Map<string, { name: string; shift: string; style: ShiftCode; draftKind: DraftKind }[]>;
  activeCats: ShiftCategory[];
  focusAreaSections: string[];
};

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

/* ── Day Popover (portal-based) ── */
function DayPopover({
  anchorEl,
  data,
  focusAreaColorMap,
  onClose,
}: {
  anchorEl: HTMLElement;
  data: DayCellData;
  focusAreaColorMap: Record<string, { bg: string; text: string }>;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const flipUp = spaceBelow < 260;
    setMenuStyle({
      position: "absolute",
      top: flipUp ? undefined : rect.bottom + window.scrollY + 4,
      bottom: flipUp ? window.innerHeight - rect.top - window.scrollY + 4 : undefined,
      left: Math.max(8, rect.left + window.scrollX),
      width: 300,
      maxHeight: Math.min(flipUp ? rect.top - 12 : spaceBelow, 500),
      zIndex: 9999,
    });
  }, [anchorEl]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !anchorEl.contains(target)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, anchorEl]);

  if (!mounted) return null;

  const { date, activeCats, categoryCounts, focusAreaSections, byFocusArea } = data;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--color-border-light)",
      }}>
        <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Employee breakdown */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
        {focusAreaSections.length === 0 ? (
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", textAlign: "center", padding: "8px 0" }}>
            No shifts scheduled
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {focusAreaSections.map((focusArea) => {
              const workers = byFocusArea.get(focusArea)!;
              const wc = focusAreaColorMap[focusArea] ?? { bg: "var(--color-bg-secondary)", text: "var(--color-text-muted)" };
              return (
                <div key={focusArea}>
                  <div style={{
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 700,
                    color: wc.text,
                    background: wc.bg,
                    borderRadius: 4,
                    padding: "3px 8px",
                    marginBottom: 5,
                  }}>
                    {focusArea}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {workers.map(({ name, shift, style: s, draftKind: dk }, ni) => (
                      <div key={`${name}-${shift}-${ni}`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{
                          background: s.color,
                          border: dk ? `2px dashed ${DRAFT_BORDER_COLORS[dk]}` : `1px solid ${borderColor(s.text)}`,
                          borderRadius: 4,
                          padding: dk ? "1px 5px" : "2px 6px",
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          color: s.text,
                          opacity: dk === 'deleted' ? 0.5 : 1,
                          textDecoration: dk === 'deleted' ? 'line-through' : 'none',
                        }}>
                          {shift}
                        </div>
                        <span style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--color-text-secondary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {shortName(name)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function MonthView({
  monthStart,
  filteredEmployees,
  shiftForKey,
  shiftCodeIdsForKey,
  isAbsenceForKey,
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

  // Popover state
  const [popoverDateKey, setPopoverDateKey] = useState<string | null>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);

  const handleCellClick = useCallback((dateKey: string, el: HTMLElement) => {
    if (popoverDateKey === dateKey) {
      setPopoverDateKey(null);
      popoverAnchorRef.current = null;
    } else {
      setPopoverDateKey(dateKey);
      popoverAnchorRef.current = el;
    }
  }, [popoverDateKey]);

  const closePopover = useCallback(() => {
    setPopoverDateKey(null);
    popoverAnchorRef.current = null;
  }, []);

  // Pre-compute all day data so the popover can access it
  const dayDataMap = useMemo(() => {
    const map = new Map<string, DayCellData>();
    for (const date of cells) {
      if (!date) continue;
      const dateKey = formatDateKey(date);
      const isToday = dateKey === todayKey;

      const categoryCounts = new Map<number, number>();
      const byFocusArea = new Map<
        string,
        { name: string; shift: string; style: ShiftCode; draftKind: DraftKind }[]
      >();

      filteredEmployees.forEach((emp) => {
        const combinedLabel = shiftForKey(emp.id, date);
        if (!combinedLabel || combinedLabel === "OFF") return;

        // Skip absence entries (off, sick, vacation, etc.) — they don't count in staffing tallies
        if (isAbsenceForKey?.(emp.id, date)) return;

        const cellCodeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
        const empHomeFas = focusAreas.filter(fa => emp.focusAreaIds.includes(fa.id));
        const shiftLabels = combinedLabel.split("/");
        shiftLabels.forEach((label, li) => {
          const codeEntry = cellCodeIds[li] != null ? shiftCodeById.get(cellCodeIds[li]) : undefined;
          const style = codeEntry ?? getShiftStyle(label, empHomeFas[0]?.name);

          if (style.categoryId != null) {
            categoryCounts.set(style.categoryId, (categoryCounts.get(style.categoryId) ?? 0) + 1);
          }

          const dk = draftKindForKey?.(emp.id, date) ?? null;

          if (style.focusAreaId != null) {
            // Focus-area-specific code: count under that focus area
            const fa = focusAreas.find(f => f.id === style.focusAreaId);
            if (!fa) return;
            const list = byFocusArea.get(fa.name) ?? [];
            list.push({ name: getEmployeeDisplayName(emp), shift: label, style, draftKind: dk });
            byFocusArea.set(fa.name, list);
          } else {
            // General/shared code: count under the employee's home focus area(s)
            for (const fa of empHomeFas) {
              const list = byFocusArea.get(fa.name) ?? [];
              list.push({ name: getEmployeeDisplayName(emp), shift: label, style, draftKind: dk });
              byFocusArea.set(fa.name, list);
            }
          }
        });
      });

      byFocusArea.forEach((list) =>
        list.sort((a, b) => shiftSortOrder(a.style) - shiftSortOrder(b.style)),
      );

      const activeCats = shiftCategories
        .filter((cat) => (categoryCounts.get(cat.id) ?? 0) > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const focusAreaSections = focusAreaNames.filter(
        (w) =>
          byFocusArea.has(w) &&
          (activeFocusArea === null || w === focusAreas.find(fa => fa.id === activeFocusArea)?.name),
      );

      map.set(dateKey, { date, dateKey, isToday, categoryCounts, byFocusArea, activeCats, focusAreaSections });
    }
    return map;
  }, [cells, todayKey, filteredEmployees, shiftForKey, shiftCodeIdsForKey, isAbsenceForKey, getShiftStyle, focusAreas, shiftCodeById, shiftCategories, focusAreaNames, activeFocusArea, draftKindForKey, categoryMap]);

  const popoverData = popoverDateKey ? dayDataMap.get(popoverDateKey) : null;

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
              fontSize: "var(--dg-fs-footnote)",
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
                  minHeight: 64,
                }}
              />
            );
          }

          const dateKey = formatDateKey(date);
          const data = dayDataMap.get(dateKey)!;
          const { isToday, activeCats, categoryCounts, focusAreaSections, byFocusArea } = data;
          const isOpen = popoverDateKey === dateKey;

          return (
            <div
              key={dateKey}
              role="button"
              tabIndex={0}
              aria-label={date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              onClick={(e) => handleCellClick(dateKey, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleCellClick(dateKey, e.currentTarget);
                }
              }}
              style={{
                background: isToday ? "var(--color-today-bg)" : "var(--color-surface)",
                border: isOpen
                  ? "2px solid var(--color-primary)"
                  : isToday
                    ? "2px solid var(--color-today-text)"
                    : "1px solid var(--color-border)",
                borderRadius: 10,
                padding: isOpen || isToday ? "8px 9px 7px" : "9px 10px 8px",
                minHeight: 64,
                boxShadow: isOpen
                  ? "0 0 0 2px rgba(46, 153, 48, 0.15)"
                  : "0 1px 3px rgba(0,0,0,0.04)",
                cursor: "pointer",
                transition: "border-color 150ms ease, box-shadow 150ms ease",
              }}
            >
              {/* Date number */}
              <div
                style={{
                  marginBottom: focusAreaSections.length > 0 ? 5 : 0,
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
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                    color: isToday ? "var(--color-text-inverse)" : "var(--color-text-secondary)",
                  }}
                >
                  {date.getDate()}
                </div>
              </div>

              {/* Focus areas + total shift count */}
              {focusAreaSections.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {focusAreaSections.map((focusArea) => {
                    const workers = byFocusArea.get(focusArea)!;
                    const wc = focusAreaColorMap[focusArea] ?? { bg: "var(--color-bg-secondary)", text: "var(--color-text-muted)" };
                    return (
                      <div
                        key={focusArea}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 600,
                            color: wc.text,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {focusArea}
                        </span>
                        <span
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 700,
                            background: wc.bg,
                            color: wc.text,
                            borderRadius: 4,
                            padding: "1px 5px",
                            flexShrink: 0,
                          }}
                        >
                          {workers.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Day popover */}
      {popoverData && popoverAnchorRef.current && (
        <DayPopover
          anchorEl={popoverAnchorRef.current}
          data={popoverData}
          focusAreaColorMap={focusAreaColorMap}
          onClose={closePopover}
        />
      )}
    </div>
  );
}
