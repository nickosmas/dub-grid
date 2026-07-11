const PAY_PERIOD_LENGTH_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function parseIsoDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number): string {
  const date = parseIsoDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateUtc(date);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Anchored 14-day pay-period start containing `targetDateIso`, or null when
 * no anchor is configured. Shared by web (apps/web/src/lib/schedule-view.ts)
 * and the mobile dashboard so both platforms' "2 weeks" window starts on the
 * same day for orgs with a custom `payPeriodStartDate`, instead of each
 * independently falling back to a Sunday-aligned week.
 */
export function getContainingPayPeriodStartIso(
  targetDateIso: string,
  payPeriodStartDateIso: string | null | undefined,
): string | null {
  if (!payPeriodStartDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(payPeriodStartDateIso)) {
    return null;
  }

  const targetDay = Math.floor(parseIsoDateOnly(targetDateIso).getTime() / MS_PER_DAY);
  const anchorDay = Math.floor(parseIsoDateOnly(payPeriodStartDateIso).getTime() / MS_PER_DAY);
  const daysSinceAnchor = targetDay - anchorDay;

  return addDaysIso(targetDateIso, -mod(daysSinceAnchor, PAY_PERIOD_LENGTH_DAYS));
}

export function getIsoWeekStart(dateIso: string): string {
  const date = parseIsoDateOnly(dateIso);
  return addDaysIso(dateIso, -date.getUTCDay());
}

/**
 * Start date for a dashboard "week" or "2 weeks" window anchored on
 * `todayIso`. For "2 weeks", uses the org's pay-period anchor when
 * configured; otherwise (and always for "week") falls back to a
 * Sunday-aligned window.
 */
export function getDashboardPeriodStartIso(
  todayIso: string,
  span: 1 | 2,
  payPeriodStartDateIso?: string | null,
): string {
  if (span === 2) {
    return getContainingPayPeriodStartIso(todayIso, payPeriodStartDateIso) ?? getIsoWeekStart(todayIso);
  }
  return getIsoWeekStart(todayIso);
}
