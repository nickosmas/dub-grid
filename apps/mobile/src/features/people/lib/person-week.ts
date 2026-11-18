import type { MobileScheduleEntry } from "@dubgrid/contracts";
import {
  addDaysToIsoDate,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntrySegments,
  isDeletedScheduleHistory,
} from "@dubgrid/schedule-core";
import { findViewerDay } from "../../schedule/lib/day-overview";
import {
  entriesShareWorkedSegment,
  getScheduleSegmentMatchKey,
  getScheduleSegmentTitle,
  isGeneralShiftSegment,
} from "../../schedule/lib/scheduleScreenChips";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Mon 16" for a calendar date. */
export function formatWeekDay(date: string): string {
  const parts = dayFormatter.formatToParts(new Date(`${date}T12:00:00Z`));
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${weekday} ${day}`;
}

export type PersonWeekDay = {
  date: string;
  label: string;
  /** "Day Shift · 7:00 AM - 3:00 PM", an absence's name, or null for a day off. */
  shift: string | null;
};

/** A person's shift each day of the week starting `weekStart` (a Sunday). */
export function buildPersonWeek(
  entries: readonly MobileScheduleEntry[],
  personId: string,
  weekStart: string,
): PersonWeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToIsoDate(weekStart, index);
    const day = findViewerDay(entries, date, personId);
    return {
      date,
      label: formatWeekDay(date),
      shift: day ? [day.title, day.time].filter(Boolean).join(" · ") : null,
    };
  });
}

function workedEntry(
  entries: readonly MobileScheduleEntry[],
  employeeId: string,
  date: string,
): MobileScheduleEntry | null {
  return (
    entries.find(
      (entry) =>
        entry.employeeId === employeeId &&
        entry.date === date &&
        !isDeletedScheduleHistory(entry) &&
        getScheduleEntryAbsenceTypeId(entry) == null,
    ) ?? null
  );
}

/**
 * The days this week the viewer and the person work the same shift, as the
 * shift's page counts shiftmates: "Mon Day Shift". Empty when they share none.
 */
export function buildWorkingWithYou(
  entries: readonly MobileScheduleEntry[],
  { personId, viewerId, weekStart }: { personId: string; viewerId: string; weekStart: string },
): string[] {
  if (personId === viewerId) return [];
  const days: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const date = addDaysToIsoDate(weekStart, index);
    const mine = workedEntry(entries, viewerId, date);
    const theirs = workedEntry(entries, personId, date);
    if (!mine || !theirs) continue;
    const shared = getScheduleEntrySegments(mine).find(
      (segment) =>
        !isGeneralShiftSegment(segment) &&
        entriesShareWorkedSegment(theirs, mine, segment, getScheduleSegmentMatchKey(segment)),
    );
    if (shared) {
      days.push(`${formatWeekDay(date).split(" ")[0]} ${getScheduleSegmentTitle(shared)}`);
    }
  }
  return days;
}
