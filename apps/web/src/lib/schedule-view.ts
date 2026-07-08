import { addDays, getWeekStart } from "@/lib/utils";

export type ScheduleSpan = 1 | 2 | "month";

export function resolveScheduleSpan(
  preferredSpan: ScheduleSpan,
  shouldAutoUseOneWeek: boolean,
): ScheduleSpan {
  return shouldAutoUseOneWeek && preferredSpan === 2 ? 1 : preferredSpan;
}

const PAY_PERIOD_LENGTH_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function toUtcDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getContainingPayPeriodStart(
  targetDate: Date,
  payPeriodStartDate: string | null | undefined,
): Date | null {
  const anchor = parseDateOnly(payPeriodStartDate);
  if (!anchor) return null;

  const daysSinceAnchor = toUtcDayNumber(targetDate) - toUtcDayNumber(anchor);
  return addDays(targetDate, -mod(daysSinceAnchor, PAY_PERIOD_LENGTH_DAYS));
}

export function getScheduleStartForSpan(args: {
  date: Date;
  span: ScheduleSpan;
  payPeriodStartDate?: string | null;
}): Date {
  const { date, span, payPeriodStartDate } = args;

  if (span === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  if (span === 2) {
    return getContainingPayPeriodStart(date, payPeriodStartDate) ?? getWeekStart(date);
  }

  return getWeekStart(date);
}
