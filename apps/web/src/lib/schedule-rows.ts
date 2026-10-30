// The staff page's Schedule list: one person's shifts and time off for a
// period in one list, newest first, grouped into Sunday to Saturday weeks.

import { addDaysToIsoDate } from "@dubgrid/schedule-core";
import type { StatusPillTone } from "@/components/ui/status-pill";
import { shiftRecordStateLabel, type ShiftRecord } from "@/lib/shift-records";
import type { TimeOffEntry } from "@/lib/time-off";

export interface ScheduleRow {
  key: string;
  kind: "shift" | "timeoff";
  /** "Fri, Oct 30", or "Oct 28 - Nov 6" for time off over several days. */
  dateLabel: string;
  /** "Day Shift, Mentor", or the absence's name. */
  title: string;
  /** Times, focus area, what it was, and notes, in one line. */
  detail: string | null;
  /** Only what needs a second look gets a pill: drafts, corrections, time off ahead or now. */
  pill: { label: string; tone: StatusPillTone } | null;
}

export interface ScheduleWeek {
  weekStart: string;
  /** "This week", "Last week", "Next week" or "Week of Oct 4". */
  label: string;
  /** "Oct 25 - 31" */
  span: string;
  rows: ScheduleRow[];
}

const UTC = { timeZone: "UTC" } as const;
const WEEKDAY_DAY = new Intl.DateTimeFormat("en-US", {
  ...UTC,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { ...UTC, month: "short", day: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-US", { ...UTC, month: "short" });

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function weekStartOf(iso: string): string {
  return addDaysToIsoDate(iso, -asDate(iso).getUTCDay());
}

function formatSpan(start: string, end: string): string {
  const startDate = asDate(start);
  const endDate = asDate(end);
  const endText =
    MONTH.format(startDate) === MONTH.format(endDate)
      ? String(endDate.getUTCDate())
      : MONTH_DAY.format(endDate);
  return `${MONTH_DAY.format(startDate)} - ${endText}`;
}

function weekLabel(weekStart: string, today: string): string {
  const current = weekStartOf(today);
  if (weekStart === current) return "This week";
  if (weekStart === addDaysToIsoDate(current, -7)) return "Last week";
  if (weekStart === addDaysToIsoDate(current, 7)) return "Next week";
  return `Week of ${MONTH_DAY.format(asDate(weekStart))}`;
}

function shiftRow(record: ShiftRecord): ScheduleRow {
  const title = record.shifts
    .map((shift) =>
      shift.jobName && shift.jobName.trim().toLowerCase() !== shift.name.trim().toLowerCase()
        ? `${shift.name}, ${shift.jobName}`
        : shift.name,
    )
    .join(" and ");
  const times = record.shifts.map((shift) => shift.time).filter(Boolean);
  const detail = [
    times.join(" and ") || null,
    record.absenceName ? `then ${record.absenceName}` : null,
    record.focusArea,
    record.was ? `was ${record.was}` : null,
    record.correctionReason,
    record.noteCount > 0
      ? `${record.noteCount} schedule ${record.noteCount === 1 ? "note" : "notes"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    key: `shift-${record.date}`,
    kind: "shift",
    dateLabel: WEEKDAY_DAY.format(asDate(record.date)),
    title: title || "Shift",
    detail: detail || null,
    pill:
      record.state === "draft"
        ? { label: shiftRecordStateLabel(record), tone: "neutral" }
        : record.state === "corrected"
          ? { label: "Corrected", tone: "info" }
          : null,
  };
}

function timeOffRow(entry: TimeOffEntry): ScheduleRow {
  const openEnded = entry.kind === "away" && entry.days === null;
  const dateLabel =
    entry.startDate === entry.endDate || openEnded
      ? `${openEnded ? "From " : ""}${WEEKDAY_DAY.format(asDate(entry.startDate))}`
      : formatSpan(entry.startDate, entry.endDate);
  const days = entry.days && entry.days > 1 ? `${entry.days} days` : null;
  return {
    key: `timeoff-${entry.key}`,
    kind: "timeoff",
    dateLabel,
    title: entry.name,
    detail: [entry.detail, days].filter(Boolean).join(" · ") || null,
    pill:
      entry.state === "planned"
        ? { label: "Planned", tone: "warning" }
        : entry.state === "now"
          ? { label: "Now", tone: "warning" }
          : null,
  };
}

/** Shifts and time off together, newest week first and newest day first within it. */
export function buildScheduleWeeks(
  records: readonly ShiftRecord[],
  timeOff: readonly TimeOffEntry[],
  today: string,
): ScheduleWeek[] {
  const dated = [
    ...records.map((record) => ({ date: record.date, order: 1, row: shiftRow(record) })),
    ...timeOff.map((entry) => ({ date: entry.startDate, order: 0, row: timeOffRow(entry) })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order);

  const weeks = new Map<string, ScheduleWeek>();
  for (const item of dated) {
    const weekStart = weekStartOf(item.date);
    let week = weeks.get(weekStart);
    if (!week) {
      week = {
        weekStart,
        label: weekLabel(weekStart, today),
        span: formatSpan(weekStart, addDaysToIsoDate(weekStart, 6)),
        rows: [],
      };
      weeks.set(weekStart, week);
    }
    week.rows.push(item.row);
  }
  return [...weeks.values()];
}
