import {
  formatCompactRangeLabel,
  parseIsoDate,
  toIsoDate,
  type PeriodRange,
} from "./period-presets";

/**
 * The dates the staff page's tabs follow: a calendar month stepped with the
 * arrows, or any span picked under Dates.
 */
export interface PersonPeriod {
  kind: "month" | "custom";
  range: PeriodRange;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

/** The viewer's calendar day as an ISO date. */
export function localIsoToday(now: Date = new Date()): string {
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function monthOf(isoDate: string, offset = 0): PeriodRange {
  const date = parseIsoDate(isoDate) ?? new Date();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + offset;
  return {
    startDate: toIsoDate(new Date(Date.UTC(year, month, 1))),
    endDate: toIsoDate(new Date(Date.UTC(year, month + 1, 0))),
  };
}

export function monthPeriod(isoDate: string): PersonPeriod {
  return { kind: "month", range: monthOf(isoDate) };
}

/**
 * The month before or after. From picked dates the arrows step out to whole
 * months: back to the month they start in, forward to the month they end in.
 */
export function stepPersonPeriod(period: PersonPeriod, step: -1 | 1): PersonPeriod {
  if (period.kind === "custom") {
    return monthPeriod(step < 0 ? period.range.startDate : period.range.endDate);
  }
  return { kind: "month", range: monthOf(period.range.startDate, step) };
}

export function isCurrentMonth(period: PersonPeriod, today: string): boolean {
  return period.kind === "month" && period.range.startDate === monthOf(today).startDate;
}

/** "October 2026", or the picked dates. */
export function formatPersonPeriodLabel(period: PersonPeriod): string {
  if (period.kind === "custom") return formatCompactRangeLabel(period.range);
  return MONTH_LABEL.format(parseIsoDate(period.range.startDate)!);
}

/**
 * The period as a sentence fragment for summaries: "No shifts this month",
 * "12 shifts in September", "3 events between Sep 1 and Oct 15".
 */
export function formatPersonPeriodPhrase(period: PersonPeriod, today: string): string {
  if (period.kind === "custom") {
    const [start, end] = formatCompactRangeLabel(period.range).split(" - ");
    return `between ${start} and ${end}`;
  }
  if (isCurrentMonth(period, today)) return "this month";
  const start = parseIsoDate(period.range.startDate)!;
  const sameYear = period.range.startDate.slice(0, 4) === today.slice(0, 4);
  return `in ${(sameYear ? MONTH_NAME : MONTH_LABEL).format(start)}`;
}
