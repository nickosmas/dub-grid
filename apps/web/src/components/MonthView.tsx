"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import type { CoverageCategorySnapshot } from "@dubgrid/schedule-core";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import MonthDayCell, { DraftRing } from "@/components/schedule-month/MonthDayCell";
import { MonthDayPanel } from "@/components/schedule-month/MonthDayPanel";
import {
  buildMonthDay,
  buildMonthWeeks,
  type MonthAbsence,
  type MonthDay,
  type MonthRequest,
} from "@/components/schedule-month/monthModel";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import type {
  AssignmentDefinition,
  DraftKind,
  Employee,
  FocusArea,
  GridOpenShift,
  IndicatorType,
  ShiftCategory,
  ShiftDisplayMode,
} from "@/types";

interface MonthViewProps {
  monthStart: Date;
  filteredEmployees: Employee[];
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  /** The day's whole-day absence in the schedule shown (the draft, for editors). */
  absenceForKey?: (empId: string, date: Date) => MonthAbsence | null;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  todayKey: string;
  focusAreas: FocusArea[];
  assignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  activeFocusArea?: number | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  shiftDisplayMode?: ShiftDisplayMode;
  noteMarksForKey?: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  indicatorTypes?: IndicatorType[];
  /** Open shifts this viewer may see. */
  openShifts?: GridOpenShift[];
  /** The month's coverage, or null when the viewer doesn't see staffing. */
  coverage?: CoverageCategorySnapshot[] | null;
  requestForKey?: (empId: string, date: Date) => MonthRequest | null;
  onOpenWeek?: (date: Date) => void;
  /** Phone width: a small calendar with the chosen day listed under it. */
  compact?: boolean;
}

const EMPTY_INDICATORS: IndicatorType[] = [];
const EMPTY_OPEN_SHIFTS: GridOpenShift[] = [];
/** Below this a cell can't hold three areas, so the calendar grows past the window instead. */
const MIN_ROW_HEIGHT = 112;
const ROW_GAP = 6;
const WEEKDAY_ROW = 24;
const BOTTOM_GUTTER = 16;

/** Keeps the calendar exactly as tall as the window leaves it, once it has room for its rows. */
function useFillHeight(
  ref: React.RefObject<HTMLDivElement | null>,
  weeks: number,
  enabled: boolean,
) {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const floor = weeks * MIN_ROW_HEIGHT + (weeks - 1) * ROW_GAP + WEEKDAY_ROW;
      setHeight(Math.max(floor, Math.round(window.innerHeight - top - BOTTOM_GUTTER)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, weeks, enabled]);
  return enabled ? height : null;
}

function MonthView({
  monthStart,
  filteredEmployees,
  highlightEmpIds,
  highlightScrollKey,
  shiftForKey,
  assignmentIdsForKey,
  absenceForKey,
  getShiftStyle,
  todayKey,
  focusAreas,
  assignments = [],
  shiftCategories,
  activeFocusArea = null,
  draftKindForKey,
  shiftDisplayMode = "code",
  noteMarksForKey,
  indicatorTypes = EMPTY_INDICATORS,
  openShifts = EMPTY_OPEN_SHIFTS,
  coverage = null,
  requestForKey,
  onOpenWeek,
  compact = false,
}: MonthViewProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const weeks = useMemo(() => buildMonthWeeks(monthStart), [monthStart]);
  const hasSearch = !!highlightEmpIds && highlightEmpIds.size > 0;

  const assignmentById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments],
  );
  const categoryById = useMemo(
    () => new Map(shiftCategories.map((category) => [category.id, category])),
    [shiftCategories],
  );
  const coverageByDay = useMemo(() => {
    if (!coverage) return null;
    const byDay = new Map<string, CoverageCategorySnapshot[]>();
    for (const snapshot of coverage) {
      const key = formatDateKey(snapshot.date);
      byDay.set(key, [...(byDay.get(key) ?? []), snapshot]);
    }
    return byDay;
  }, [coverage]);

  const days = useMemo(() => {
    const map = new Map<string, MonthDay>();
    for (const date of weeks.flat()) {
      if (!date) continue;
      const day = buildMonthDay({
        date,
        todayKey,
        employees: filteredEmployees,
        focusAreas,
        activeFocusArea,
        categoryById,
        assignmentById,
        highlightEmpIds,
        shiftForKey,
        assignmentIdsForKey,
        absenceForKey,
        getShiftStyle,
        draftKindForKey,
        noteMarksForKey,
        requestForKey,
        openShifts,
        coverage: coverageByDay ? (coverageByDay.get(formatDateKey(date)) ?? []) : null,
      });
      map.set(day.dateKey, day);
    }
    return map;
  }, [
    weeks,
    todayKey,
    filteredEmployees,
    focusAreas,
    activeFocusArea,
    categoryById,
    assignmentById,
    highlightEmpIds,
    shiftForKey,
    assignmentIdsForKey,
    absenceForKey,
    getShiftStyle,
    draftKindForKey,
    noteMarksForKey,
    requestForKey,
    openShifts,
    coverageByDay,
  ]);

  const firstKey = formatDateKey(monthStart);
  const defaultKey = days.has(todayKey) ? todayKey : firstKey;
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  // A choice from another month doesn't carry over; a phone always shows a day.
  const selectedKey = chosenKey && days.has(chosenKey) ? chosenKey : compact ? defaultKey : null;
  const selectedDay = selectedKey ? days.get(selectedKey) : undefined;
  const focusKey = selectedKey ?? defaultKey;

  const select = useCallback(
    (dateKey: string) =>
      setChosenKey((current) => (current === dateKey && !compact ? null : dateKey)),
    [compact],
  );
  const close = useCallback(() => setChosenKey(null), []);

  const moveFocus = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const steps: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      const from = (event.target as HTMLElement).closest<HTMLElement>("[data-date-key]");
      if (event.key === "Escape" && !compact && selectedKey) {
        event.preventDefault();
        close();
        return;
      }
      const step = steps[event.key];
      if (step == null || !from?.dataset.dateKey) return;
      const [year, month, day] = from.dataset.dateKey.split("-").map(Number);
      const next = formatDateKey(new Date(year, month - 1, day + step));
      const target = gridRef.current?.querySelector<HTMLElement>(`[data-date-key="${next}"]`);
      if (!target) return;
      event.preventDefault();
      target.focus();
    },
    [close, compact, selectedKey],
  );

  useEffect(() => {
    if (!highlightScrollKey || !hasSearch) return;
    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-search-hit]")
        ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightScrollKey, hasSearch]);

  const fillHeight = useFillHeight(rootRef, weeks.length, !compact);
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const legend = compact && (
    <div className="dg-month-legend" aria-hidden="true">
      {coverage && (
        <span className="dg-month-legend__item">
          <span className="dg-month-dot" data-kind="short" />
          Short of a staffing target
        </span>
      )}
      <span className="dg-month-legend__item">
        <span className="dg-month-dot" data-kind="open" />
        Open shift
      </span>
      <span className="dg-month-legend__item">
        <DraftRing size={9} />
        Unpublished changes
      </span>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="dg-month"
      data-compact={compact || undefined}
      style={fillHeight ? { height: fillHeight } : undefined}
      onKeyDown={moveFocus}
    >
      <div className="dg-month__calendar">
        <div className="dg-month__weekdays" aria-hidden="true">
          {DAY_LABELS.map((label) => (
            <div key={label} className="dg-month__weekday">
              {compact ? label.slice(0, 1) : label}
            </div>
          ))}
        </div>
        <div ref={gridRef} className="dg-month__grid" role="group" aria-label={monthLabel}>
          {weeks.flat().map((date, index) => {
            if (!date) return <div key={`blank-${index}`} className="dg-month__blank" />;
            const day = days.get(formatDateKey(date))!;
            return (
              <MonthDayCell
                key={day.dateKey}
                day={day}
                isSelected={day.dateKey === selectedKey}
                isFocusTarget={day.dateKey === focusKey}
                singleArea={activeFocusArea !== null}
                hasSearch={hasSearch}
                compact={compact}
                isDark={isDark}
                onSelect={select}
              />
            );
          })}
        </div>
        {legend}
      </div>
      {selectedDay && (
        <MonthDayPanel
          day={selectedDay}
          isNameMode={shiftDisplayMode === "name"}
          hasSearch={hasSearch}
          isDark={isDark}
          indicatorTypes={indicatorTypes}
          onClose={compact ? undefined : close}
          onOpenWeek={onOpenWeek}
        />
      )}
    </div>
  );
}

export default memo(MonthView);
