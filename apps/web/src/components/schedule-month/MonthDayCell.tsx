"use client";

import { memo } from "react";
import { resolveShiftPillColors } from "@/lib/colors";
import {
  formatCoverageCount,
  type MonthArea,
  type MonthDay,
  type MonthShiftGroup,
} from "./monthModel";

interface MonthDayCellProps {
  day: MonthDay;
  isSelected: boolean;
  isFocusTarget: boolean;
  /** One focus area is chosen, so its shifts get a row each. */
  singleArea: boolean;
  hasSearch: boolean;
  compact: boolean;
  isDark: boolean;
  onSelect: (dateKey: string) => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function DraftRing({ size = 10 }: { size?: number }) {
  const r = size / 2 - 1;
  const quarter = (Math.PI * 2 * r) / 4;
  return (
    <svg
      className="dg-month-draft"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Unpublished changes"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={`${quarter * 0.62} ${quarter * 0.38}`}
      />
    </svg>
  );
}

/** What a screen reader hears for a day, in the order the cell shows it. */
export function describeMonthDay(day: MonthDay): string {
  const parts = [
    day.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
  ];
  if (day.isToday) parts.push("today");
  parts.push(`${day.working} working`);
  if (day.short > 0) parts.push(`${formatCoverageCount(day.short)} short`);
  if (day.openShifts.length > 0) parts.push(plural(day.openShifts.length, "open shift"));
  if (day.absent > 0) parts.push(`${day.absent} absent`);
  if (day.hasDraft) parts.push("unpublished changes");
  if (day.waitingOn === "manager") parts.push("a request waiting on a manager");
  else if (day.waitingOn) parts.push("a request waiting on a teammate");
  return parts.join(", ");
}

function Chip({ group, isDark }: { group: MonthShiftGroup; isDark: boolean }) {
  const colors = resolveShiftPillColors(
    { color: group.color, text: group.text, border: group.color },
    isDark,
  );
  return (
    <span
      className="dg-month-chip dg-tabular-nums"
      data-short={group.short > 0 || undefined}
      style={{ background: colors.color, color: colors.text }}
    >
      {group.code} {group.people.length}
    </span>
  );
}

const shownGroups = (area: MonthArea) =>
  area.groups.filter((group) => group.people.length > 0 || group.short > 0);

function CellRows({
  day,
  singleArea,
  isDark,
}: {
  day: MonthDay;
  singleArea: boolean;
  isDark: boolean;
}) {
  if (singleArea) {
    return (
      <div className="dg-month-day__rows">
        {day.areas.flatMap((area) =>
          shownGroups(area).map((group) => (
            <div key={`${area.focusAreaId}-${group.key}`} className="dg-month-row">
              <span className="dg-month-row__name">{group.name}</span>
              <span className="dg-month-row__chips">
                <Chip group={group} isDark={isDark} />
              </span>
            </div>
          )),
        )}
      </div>
    );
  }
  return (
    <div className="dg-month-day__rows">
      {day.areas.map((area) => {
        const groups = shownGroups(area);
        if (groups.length === 0) return null;
        return (
          <div key={area.focusAreaId} className="dg-month-row">
            <span className="dg-month-row__name">{area.name}</span>
            <span className="dg-month-row__chips">
              {groups.map((group) => (
                <Chip key={group.key} group={group} isDark={isDark} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MonthDayCell({
  day,
  isSelected,
  isFocusTarget,
  singleArea,
  hasSearch,
  compact,
  isDark,
  onSelect,
}: MonthDayCellProps) {
  return (
    <button
      type="button"
      className="dg-month-day"
      data-date-key={day.dateKey}
      data-today={day.isToday || undefined}
      data-past={day.isPast || undefined}
      data-search-hit={(hasSearch && day.hasHighlighted) || undefined}
      data-search-miss={(hasSearch && !day.hasHighlighted) || undefined}
      aria-pressed={isSelected}
      aria-label={describeMonthDay(day)}
      tabIndex={isFocusTarget ? 0 : -1}
      onClick={() => onSelect(day.dateKey)}
    >
      {day.waitingOn && <span className="dg-month-fold" data-waiting-on={day.waitingOn} />}
      {compact ? (
        <>
          <span className="dg-month-day__num dg-tabular-nums">{day.date.getDate()}</span>
          <span className="dg-month-dots" aria-hidden="true">
            {day.short > 0 && <span className="dg-month-dot" data-kind="short" />}
            {day.openShifts.length > 0 && <span className="dg-month-dot" data-kind="open" />}
            {day.hasDraft && <DraftRing size={9} />}
          </span>
        </>
      ) : (
        <>
          <span className="dg-month-day__head">
            <span className="dg-month-day__num dg-tabular-nums">{day.date.getDate()}</span>
            <span className="dg-month-day__marks" aria-hidden="true">
              {day.short > 0 && (
                <span className="dg-month-short dg-tabular-nums">
                  {formatCoverageCount(day.short)} short
                </span>
              )}
              {day.openShifts.length > 0 && (
                <span className="dg-month-open dg-tabular-nums">{day.openShifts.length} open</span>
              )}
              {day.hasDraft && <DraftRing />}
            </span>
          </span>
          <CellRows day={day} singleArea={singleArea} isDark={isDark} />
          {day.absent > 0 && (
            <span className="dg-month-day__off dg-tabular-nums">{day.absent} absent</span>
          )}
        </>
      )}
    </button>
  );
}

export default memo(MonthDayCell);
