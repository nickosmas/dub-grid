"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import {
  Employee,
  ShiftCategory,
  AssignmentDefinition,
  FocusArea,
  DraftKind,
  ShiftDisplayMode,
} from "@/types";
import { borderColor, DRAFT_BORDER_COLORS, resolveShiftPillColors } from "@/lib/colors";

function pillText(label: string, max: number): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "\u2026";
}

interface MonthViewProps {
  monthStart: Date;
  filteredEmployees: Employee[];
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  isAbsenceForKey?: (empId: string, date: Date) => boolean;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  todayKey: string;
  focusAreas: FocusArea[];
  assignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  activeFocusArea?: number | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  shiftDisplayMode?: ShiftDisplayMode;
}

type DayCellData = {
  date: Date;
  dateKey: string;
  isToday: boolean;
  hasHighlightedEmployee: boolean;
  categoryCounts: Map<number, number>;
  byFocusArea: Map<
    string,
    {
      name: string;
      shift: string;
      style: AssignmentDefinition;
      draftKind: DraftKind;
      isHighlighted: boolean;
    }[]
  >;
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

const NEUTRAL_FA_STYLE = {
  bg: "var(--dg-color-bg-secondary)",
  text: "var(--dg-color-text-muted)",
} as const;

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[0] + (parts[1] ? " " + parts[1][0] + "." : "");
}

/* ── Day Popover (portal-based) ── */
function DayPopover({
  anchorEl,
  data,
  onClose,
  isNameMode = false,
  hasHighlightedSearch = false,
}: {
  anchorEl: HTMLElement;
  data: DayCellData;
  onClose: () => void;
  isNameMode?: boolean;
  hasHighlightedSearch?: boolean;
}) {
  const { date, focusAreaSections, byFocusArea } = data;
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  return (
    <Popover
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <PopoverContent
        anchor={anchorEl}
        side="bottom"
        align="start"
        sideOffset={4}
        positionMethod="fixed"
        collisionPadding={8}
        collisionAvoidance={{
          side: "flip",
          align: "shift",
          fallbackAxisSide: "none",
        }}
        initialFocus={false}
        finalFocus={false}
        style={{
          background: "var(--dg-color-surface)",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-lg)",
          boxShadow: "var(--shadow-menu)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: 300,
          maxHeight: "min(500px, var(--available-height))",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--dg-color-border-light)",
          }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {/* Employee breakdown */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px" }}>
          {focusAreaSections.length === 0 ? (
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                textAlign: "center",
                padding: "8px 0",
              }}
            >
              No shifts scheduled
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {focusAreaSections.map((focusArea) => {
                const workers = byFocusArea.get(focusArea)!;
                const wc = NEUTRAL_FA_STYLE;
                return (
                  <div key={focusArea}>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 700,
                        color: wc.text,
                        background: wc.bg,
                        borderRadius: "var(--dg-radius-xs)",
                        padding: "3px 8px",
                        marginBottom: 5,
                      }}
                    >
                      {focusArea}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {workers.map(
                        ({ name, shift, style: s0, draftKind: dk, isHighlighted }, ni) => {
                          const s = resolveShiftPillColors(
                            { color: s0.color, text: s0.text, border: s0.border },
                            isDarkTheme,
                          );
                          return (
                            <div
                              key={`${name}-${shift}-${ni}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "2px 4px",
                                borderRadius: "var(--dg-radius-sm)",
                                background:
                                  hasHighlightedSearch && isHighlighted
                                    ? "var(--dg-color-brand-bg)"
                                    : "transparent",
                                boxShadow:
                                  hasHighlightedSearch && isHighlighted
                                    ? "inset 3px 0 0 0 var(--dg-color-brand)"
                                    : undefined,
                                opacity: hasHighlightedSearch && !isHighlighted ? 0.35 : 1,
                                transition:
                                  "opacity 150ms ease, background 150ms ease, box-shadow 150ms ease",
                              }}
                            >
                              <div
                                style={{
                                  background: s.color,
                                  border: dk
                                    ? `2px dashed ${DRAFT_BORDER_COLORS[dk]}`
                                    : `1px solid ${borderColor(s.text)}`,
                                  borderRadius: "var(--dg-radius-xs)",
                                  padding: isNameMode ? "3px 6px" : dk ? "1px 5px" : "2px 6px",
                                  fontSize: "var(--dg-fs-footnote)",
                                  fontWeight: 600,
                                  color: s.text,
                                  opacity: dk === "deleted" ? 0.5 : 1,
                                  textDecoration: dk === "deleted" ? "line-through" : "none",
                                  maxWidth: 120,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isNameMode ? pillText(shift, 14) : shift}
                              </div>
                              <span
                                style={{
                                  fontSize: "var(--dg-fs-footnote)",
                                  color:
                                    hasHighlightedSearch && isHighlighted
                                      ? "var(--dg-color-brand)"
                                      : "var(--dg-color-text-secondary)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {shortName(name)}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <ScrollOverflowCue />
      </PopoverContent>
    </Popover>
  );
}

export default function MonthView({
  monthStart,
  filteredEmployees,
  highlightEmpIds,
  highlightScrollKey,
  shiftForKey,
  assignmentIdsForKey,
  isAbsenceForKey,
  getShiftStyle,
  todayKey,
  focusAreas,
  assignments = [],
  shiftCategories,
  activeFocusArea = null,
  draftKindForKey,
  shiftDisplayMode = "code",
}: MonthViewProps) {
  const isNameMode = shiftDisplayMode === "name";
  const cells = useMemo(() => buildMonthCells(monthStart), [monthStart]);
  const focusAreaNames = focusAreas.map((w) => w.name);
  const hasHighlightedSearch = !!(highlightEmpIds && highlightEmpIds.size > 0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Look up assignments by ID so cross-focus-area shifts render in their own color
  const assignmentById = useMemo(() => {
    const map = new Map<number, AssignmentDefinition>();
    for (const sc of assignments) map.set(sc.id, sc);
    return map;
  }, [assignments]);

  // Build a map of categoryId → category for fast lookup
  const categoryMap = useMemo(() => {
    const m = new Map<number, ShiftCategory>();
    for (const cat of shiftCategories) m.set(cat.id, cat);
    return m;
  }, [shiftCategories]);

  // Sort-order for a shift style: use its category's sortOrder, fall back to a high number
  const shiftSortOrder = useCallback(
    (style: AssignmentDefinition): number => {
      if (style.categoryId != null) {
        return categoryMap.get(style.categoryId)?.sortOrder ?? 99;
      }
      return 99;
    },
    [categoryMap],
  );

  // Popover state
  const [popoverDateKey, setPopoverDateKey] = useState<string | null>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);

  const handleCellClick = useCallback(
    (dateKey: string, el: HTMLElement) => {
      if (popoverDateKey === dateKey) {
        setPopoverDateKey(null);
        popoverAnchorRef.current = null;
      } else {
        setPopoverDateKey(dateKey);
        popoverAnchorRef.current = el;
      }
    },
    [popoverDateKey],
  );

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
      let hasHighlightedEmployee = false;
      const byFocusArea = new Map<
        string,
        {
          name: string;
          shift: string;
          style: AssignmentDefinition;
          draftKind: DraftKind;
          isHighlighted: boolean;
        }[]
      >();

      filteredEmployees.forEach((emp) => {
        const combinedLabel = shiftForKey(emp.id, date);
        if (!combinedLabel || combinedLabel === "OFF") return;

        // Skip absence entries (off, sick, vacation, etc.) — they don't count in staffing tallies
        if (isAbsenceForKey?.(emp.id, date)) return;

        const cellCodeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
        const empHomeFas = focusAreas.filter((fa) => emp.focusAreaIds.includes(fa.id));
        const isHighlighted = highlightEmpIds?.has(emp.id) ?? false;
        const shiftLabels = combinedLabel.split("/");
        shiftLabels.forEach((label, li) => {
          const codeEntry =
            cellCodeIds[li] != null ? assignmentById.get(cellCodeIds[li]) : undefined;
          const style = codeEntry ?? getShiftStyle(label, empHomeFas[0]?.name);

          if (style.categoryId != null) {
            categoryCounts.set(style.categoryId, (categoryCounts.get(style.categoryId) ?? 0) + 1);
          }

          if (isHighlighted) {
            hasHighlightedEmployee = true;
          }

          const dk = draftKindForKey?.(emp.id, date) ?? null;

          if (style.focusAreaId != null) {
            // Focus-area-specific code: count under that focus area
            const fa = focusAreas.find((f) => f.id === style.focusAreaId);
            if (!fa) return;
            const list = byFocusArea.get(fa.name) ?? [];
            list.push({
              name: getEmployeeDisplayName(emp),
              shift: label,
              style,
              draftKind: dk,
              isHighlighted,
            });
            byFocusArea.set(fa.name, list);
          } else {
            // BUG 1.8: General/shared code: count under only the employee's primary focus area
            // to avoid inflating headcount for employees with multiple focus areas
            const primaryFa = empHomeFas[0];
            if (primaryFa) {
              const list = byFocusArea.get(primaryFa.name) ?? [];
              list.push({
                name: getEmployeeDisplayName(emp),
                shift: label,
                style,
                draftKind: dk,
                isHighlighted,
              });
              byFocusArea.set(primaryFa.name, list);
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
          (activeFocusArea === null ||
            w === focusAreas.find((fa) => fa.id === activeFocusArea)?.name),
      );

      map.set(dateKey, {
        date,
        dateKey,
        isToday,
        hasHighlightedEmployee,
        categoryCounts,
        byFocusArea,
        activeCats,
        focusAreaSections,
      });
    }
    return map;
  }, [
    cells,
    todayKey,
    filteredEmployees,
    shiftForKey,
    assignmentIdsForKey,
    isAbsenceForKey,
    getShiftStyle,
    focusAreas,
    assignmentById,
    shiftCategories,
    focusAreaNames,
    activeFocusArea,
    highlightEmpIds,
    draftKindForKey,
    shiftSortOrder,
  ]);

  const popoverData = popoverDateKey ? dayDataMap.get(popoverDateKey) : null;

  useEffect(() => {
    if (!highlightScrollKey || !hasHighlightedSearch) return;

    const frame = window.requestAnimationFrame(() => {
      const firstHighlightedDay = rootRef.current?.querySelector<HTMLElement>(
        '[data-search-highlight="true"]',
      );
      firstHighlightedDay?.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightScrollKey, hasHighlightedSearch]);

  return (
    <div ref={rootRef}>
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
              color: "var(--dg-color-text-subtle)",
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
                  borderRadius: "var(--dg-radius-lg)",
                  minHeight: 64,
                }}
              />
            );
          }

          const dateKey = formatDateKey(date);
          const data = dayDataMap.get(dateKey)!;
          const { isToday, focusAreaSections, byFocusArea, hasHighlightedEmployee } = data;
          const isOpen = popoverDateKey === dateKey;
          const isSearchHighlightedDay = hasHighlightedSearch && hasHighlightedEmployee;

          return (
            <div
              key={dateKey}
              role="button"
              tabIndex={0}
              data-search-highlight={isSearchHighlightedDay ? "true" : undefined}
              aria-label={date.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              onClick={(e) => handleCellClick(dateKey, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleCellClick(dateKey, e.currentTarget);
                }
              }}
              style={{
                background: isSearchHighlightedDay
                  ? isToday
                    ? "linear-gradient(180deg, var(--dg-color-brand-bg) 0%, var(--dg-color-today-bg) 100%)"
                    : "var(--dg-color-brand-bg)"
                  : isToday
                    ? "var(--dg-color-today-bg)"
                    : "var(--dg-color-surface)",
                border: isOpen
                  ? "2px solid var(--dg-color-brand-border)"
                  : isSearchHighlightedDay
                    ? "2px solid var(--dg-color-brand-border)"
                    : isToday
                      ? "2px solid var(--dg-color-today-text)"
                      : "1px solid var(--dg-color-border)",
                borderRadius: "var(--dg-radius-lg)",
                padding: isOpen || isToday ? "8px 9px 7px" : "9px 10px 8px",
                minHeight: 64,
                boxShadow: isOpen
                  ? "0 0 0 2px rgba(37, 99, 235, 0.12)"
                  : isSearchHighlightedDay
                    ? "0 0 0 2px rgba(37, 99, 235, 0.12)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                cursor: "pointer",
                opacity: hasHighlightedSearch && !hasHighlightedEmployee ? 0.35 : 1,
                transition:
                  "border-color 150ms ease, box-shadow 150ms ease, opacity 150ms ease, background 150ms ease",
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
                    background: isToday ? "var(--dg-color-today-text)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                    color: isToday
                      ? "var(--dg-color-text-inverse)"
                      : "var(--dg-color-text-secondary)",
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
                    const wc = NEUTRAL_FA_STYLE;
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
                            borderRadius: "var(--dg-radius-xs)",
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
          onClose={closePopover}
          isNameMode={isNameMode}
          hasHighlightedSearch={hasHighlightedSearch}
        />
      )}
    </div>
  );
}
