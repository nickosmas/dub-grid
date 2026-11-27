import { MAX_DAYS_IN_A_ROW, MAX_DAYS_IN_A_WEEK, WEEKLY_OVERTIME_HOURS } from "./hours-assembly";
import { addDaysToIsoDate, getDaysBetweenIsoDates, parseIsoDate } from "./dates";

/** How many days in a row the person works with this day worked, counted both ways. */
export function daysInARowWith(worked: (dateKey: string) => boolean, dateKey: string): number {
  const reach = MAX_DAYS_IN_A_ROW * 2;
  let days = 1;
  for (
    let offset = -1;
    offset >= -reach && worked(addDaysToIsoDate(dateKey, offset));
    offset -= 1
  ) {
    days += 1;
  }
  for (let offset = 1; offset <= reach && worked(addDaysToIsoDate(dateKey, offset)); offset += 1) {
    days += 1;
  }
  return days;
}

/** How many days the person works in the Sunday-to-Saturday week holding a date, with that date worked. */
export function daysInWeekWith(worked: (dateKey: string) => boolean, dateKey: string): number {
  const sunday = addDaysToIsoDate(dateKey, -parseIsoDate(dateKey).getUTCDay());
  let days = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const key = addDaysToIsoDate(sunday, offset);
    if (key === dateKey || worked(key)) days += 1;
  }
  return days;
}

/** A limit a worked day crosses; dates are YYYY-MM-DD, a week runs Sunday to Saturday. */
export type WorkLimitBreak =
  | { limit: "row"; days: number; start: string; end: string }
  | { limit: "week"; days: number; start: string; end: string }
  | { limit: "hours"; hours: number; start: string; end: string };

/** Far enough to name any real run, short enough that a worked() that never says no still ends. */
const RUN_SEARCH_DAYS = 62;

function runEdge(worked: (dateKey: string) => boolean, dateKey: string, step: 1 | -1): string {
  let edge = dateKey;
  for (let count = 0; count < RUN_SEARCH_DAYS; count += 1) {
    const next = addDaysToIsoDate(edge, step);
    if (!worked(next)) break;
    edge = next;
  }
  return edge;
}

/**
 * Every work limit a worked day crosses: more than five days in a row
 * (across weeks and periods), more than five days in its Sunday-to-Saturday
 * week, and more than 40 hours in that week. The caller gives the week's
 * hours, so each app counts them its own way. A day not worked crosses none.
 */
export function workLimitBreaks({
  worked,
  weekHours,
  dateKey,
}: {
  worked: (dateKey: string) => boolean;
  weekHours?: number;
  dateKey: string;
}): WorkLimitBreak[] {
  if (!worked(dateKey)) return [];
  const breaks: WorkLimitBreak[] = [];
  const start = runEdge(worked, dateKey, -1);
  const end = runEdge(worked, dateKey, 1);
  const days = getDaysBetweenIsoDates(start, end) + 1;
  if (days > MAX_DAYS_IN_A_ROW) breaks.push({ limit: "row", days, start, end });
  const sunday = addDaysToIsoDate(dateKey, -parseIsoDate(dateKey).getUTCDay());
  const saturday = addDaysToIsoDate(sunday, 6);
  const weekDays = daysInWeekWith(worked, dateKey);
  if (weekDays > MAX_DAYS_IN_A_WEEK) {
    breaks.push({ limit: "week", days: weekDays, start: sunday, end: saturday });
  }
  if (weekHours != null && weekHours > WEEKLY_OVERTIME_HOURS) {
    breaks.push({ limit: "hours", hours: weekHours, start: sunday, end: saturday });
  }
  return breaks;
}
