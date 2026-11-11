import {
  addDays,
  formatCompactRangeLabel,
  parseIsoDate,
  PAY_PERIOD_DAYS,
  toIsoDate,
  type PeriodRange,
} from "./period-presets";

/** The length the arrows step by. */
export type PersonPeriodSpan = "week" | "pay-period" | "month" | "year";

/**
 * The dates a person's tabs follow: a week, pay period, month or year stepped
 * with the arrows, or any span picked under Dates.
 */
export interface PersonPeriod {
  kind: PersonPeriodSpan | "custom";
  range: PeriodRange;
}

export const PERSON_PERIOD_SPAN_LABELS: Record<PersonPeriodSpan, string> = {
  week: "Week",
  "pay-period": "Pay period",
  month: "Month",
  year: "Year",
};

/** The span's name inside a sentence: "Previous pay period", "this week". */
export const PERSON_PERIOD_SPAN_NOUNS: Record<PersonPeriodSpan, string> = {
  week: "week",
  "pay-period": "pay period",
  month: "month",
  year: "year",
};

/** The spans offered: Pay period only once the organization has set one. */
export function personPeriodSpans(
  payPeriodStartDate: string | null | undefined,
): PersonPeriodSpan[] {
  return payPeriodStartDate && parseIsoDate(payPeriodStartDate)
    ? ["week", "pay-period", "month", "year"]
    : ["week", "month", "year"];
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const DAY_MS = 86_400_000;

/** The viewer's calendar day as an ISO date. */
export function localIsoToday(now: Date = new Date()): string {
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function spanRange(
  span: PersonPeriodSpan,
  isoDate: string,
  offset: number,
  payPeriodStartDate?: string | null,
): PeriodRange {
  const date = parseIsoDate(isoDate) ?? new Date();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const anchor = payPeriodStartDate ? parseIsoDate(payPeriodStartDate) : null;
  if (span === "pay-period" && anchor) {
    const periods = Math.floor((date.getTime() - anchor.getTime()) / DAY_MS / PAY_PERIOD_DAYS);
    const start = addDays(anchor, (periods + offset) * PAY_PERIOD_DAYS);
    return { startDate: toIsoDate(start), endDate: toIsoDate(addDays(start, PAY_PERIOD_DAYS - 1)) };
  }
  if (span === "week" || span === "pay-period") {
    // Sunday to Saturday, as the schedule's weeks run.
    const start = addDays(date, offset * 7 - date.getUTCDay());
    return { startDate: toIsoDate(start), endDate: toIsoDate(addDays(start, 6)) };
  }
  if (span === "year") {
    return {
      startDate: toIsoDate(new Date(Date.UTC(year + offset, 0, 1))),
      endDate: toIsoDate(new Date(Date.UTC(year + offset, 11, 31))),
    };
  }
  return {
    startDate: toIsoDate(new Date(Date.UTC(year, month + offset, 1))),
    endDate: toIsoDate(new Date(Date.UTC(year, month + offset + 1, 0))),
  };
}

/** The week, pay period, month or year holding the date. */
export function personPeriod(
  span: PersonPeriodSpan,
  isoDate: string,
  payPeriodStartDate?: string | null,
): PersonPeriod {
  return { kind: span, range: spanRange(span, isoDate, 0, payPeriodStartDate) };
}

export function monthPeriod(isoDate: string): PersonPeriod {
  return personPeriod("month", isoDate);
}

/**
 * The span before or after. From picked dates the arrows step out to the
 * chosen span: back to the one they start in, forward to the one they end in.
 */
export function stepPersonPeriod(
  period: PersonPeriod,
  step: -1 | 1,
  options: { span?: PersonPeriodSpan; payPeriodStartDate?: string | null } = {},
): PersonPeriod {
  const { payPeriodStartDate } = options;
  if (period.kind === "custom") {
    const date = step < 0 ? period.range.startDate : period.range.endDate;
    return personPeriod(options.span ?? "month", date, payPeriodStartDate);
  }
  return {
    kind: period.kind,
    range: spanRange(period.kind, period.range.startDate, step, payPeriodStartDate),
  };
}

export function isCurrentPeriod(
  period: PersonPeriod,
  today: string,
  payPeriodStartDate?: string | null,
): boolean {
  if (period.kind === "custom") return false;
  return period.range.startDate === spanRange(period.kind, today, 0, payPeriodStartDate).startDate;
}

/** "October 2026", "2026", or the dates for a week, pay period or picked span. */
export function formatPersonPeriodLabel(period: PersonPeriod): string {
  if (period.kind === "month") return MONTH_LABEL.format(parseIsoDate(period.range.startDate)!);
  if (period.kind === "year") return period.range.startDate.slice(0, 4);
  return formatCompactRangeLabel(period.range);
}

/**
 * The period as a sentence fragment for summaries: "No shifts this week",
 * "12 shifts in September", "3 events between Sep 1 and Oct 15".
 */
export function formatPersonPeriodPhrase(
  period: PersonPeriod,
  today: string,
  payPeriodStartDate?: string | null,
): string {
  if (period.kind !== "custom" && isCurrentPeriod(period, today, payPeriodStartDate)) {
    return `this ${PERSON_PERIOD_SPAN_NOUNS[period.kind]}`;
  }
  if (period.kind === "year") return `in ${period.range.startDate.slice(0, 4)}`;
  if (period.kind === "month") {
    const start = parseIsoDate(period.range.startDate)!;
    const sameYear = period.range.startDate.slice(0, 4) === today.slice(0, 4);
    return `in ${(sameYear ? MONTH_NAME : MONTH_LABEL).format(start)}`;
  }
  const [start, end] = formatCompactRangeLabel(period.range).split(" - ");
  return `between ${start} and ${end}`;
}
