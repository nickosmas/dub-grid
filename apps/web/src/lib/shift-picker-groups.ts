import { formatScheduleTimeValue, getMinutesSinceMidnight } from "@dubgrid/schedule-core";

import { sameDayRangesOverlap } from "@/lib/schedule-logic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekdayOf(date: string, offsetDays: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day + offsetDays)).getUTCDay()];
}

function isOvernight(start: string, end: string): boolean {
  const startMinutes = getMinutesSinceMidnight(start);
  const endMinutes = getMinutesSinceMidnight(end);
  return startMinutes != null && endMinutes != null && endMinutes <= startMinutes;
}

/** "7:00 AM - 3:00 PM", or "Thu 11:00 PM - Fri 7:00 AM" when the shift crosses midnight. */
export function formatShiftWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  date: string | null | undefined,
): string | null {
  if (!start || !end) return null;
  const startText = formatScheduleTimeValue(start);
  const endText = formatScheduleTimeValue(end);
  if (date && isOvernight(start, end)) {
    return `${weekdayOf(date, 0)} ${startText} - ${weekdayOf(date, 1)} ${endText}`;
  }
  return `${startText} - ${endText}`;
}

export interface WorkingShift {
  name: string;
  shiftId: number | null;
  start: string | null;
  end: string | null;
}

interface SecondShiftCandidate {
  shiftId: number | null;
  startTime: string | null;
  endTime: string | null;
}

/** Why a shift can't join the one already worked that day, or null when it fits. */
export function secondShiftClash(
  candidate: SecondShiftCandidate,
  working: WorkingShift,
  date: string | null | undefined,
): string | null {
  if (candidate.shiftId != null && candidate.shiftId === working.shiftId) {
    return "Already working this shift";
  }
  if (!candidate.startTime || !candidate.endTime || !working.start || !working.end) return null;
  // Stored times may carry seconds; the overlap check compares "HH:MM" strings.
  const overlaps = sameDayRangesOverlap(
    { start: candidate.startTime.slice(0, 5), end: candidate.endTime.slice(0, 5) },
    { start: working.start.slice(0, 5), end: working.end.slice(0, 5) },
  );
  return overlaps ? `Overlaps ${formatShiftWindow(working.start, working.end, date)}` : null;
}
