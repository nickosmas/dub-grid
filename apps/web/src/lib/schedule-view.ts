import { getContainingPayPeriodStartIso, getDashboardPeriodStartIso } from "@dubgrid/schedule-core";

export type ScheduleSpan = 1 | 2 | "month";

export function resolveScheduleSpan(
  preferredSpan: ScheduleSpan,
  shouldAutoUseOneWeek: boolean,
): ScheduleSpan {
  return shouldAutoUseOneWeek && preferredSpan === 2 ? 1 : preferredSpan;
}

// Date <-> local "YYYY-MM-DD" conversions. The pay-period anchor math itself
// lives in @dubgrid/schedule-core (shared with the mobile dashboard) as pure
// ISO-string arithmetic; this file just adapts it to/from the Date objects
// the rest of web's scheduler code uses.
function toLocalIsoDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalIsoDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getContainingPayPeriodStart(
  targetDate: Date,
  payPeriodStartDate: string | null | undefined,
): Date | null {
  const startIso = getContainingPayPeriodStartIso(
    toLocalIsoDateKey(targetDate),
    payPeriodStartDate,
  );
  return startIso ? parseLocalIsoDateKey(startIso) : null;
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

  const startIso = getDashboardPeriodStartIso(
    toLocalIsoDateKey(date),
    span === 2 ? 2 : 1,
    payPeriodStartDate,
  );
  return parseLocalIsoDateKey(startIso);
}

export function realignTwoWeekScheduleStart(
  currentStart: Date,
  span: ScheduleSpan,
  payPeriodStartDate: string | null | undefined,
): Date {
  if (span !== 2) return currentStart;
  return getScheduleStartForSpan({
    date: currentStart,
    span: 2,
    payPeriodStartDate,
  });
}
