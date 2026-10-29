// Every date here is a UTC ISO day ("2026-10-29"), and the week math is UTC
// too. The Reports pipeline formats with `timeZone: "UTC"`, so the local-time
// `getWeekStart`/`addDays` in `@/lib/utils` would shift a range by the
// viewer's offset. Do not swap these for those.

export type PeriodPreset =
  "current-week" | "pay-period" | "this-month" | "last-12-weeks" | "custom";

export interface PeriodRange {
  startDate: string;
  /** Inclusive. */
  endDate: string;
}

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  "current-week": "Current week",
  "pay-period": "Pay period",
  "this-month": "This month",
  "last-12-weeks": "Last 12 weeks",
  custom: "Custom",
};

/** The longest custom range, matching the shift query's own limit. */
export const MAX_CUSTOM_RANGE_DAYS = 366;

const PAY_PERIOD_DAYS = 14;
const DAY_MS = 86_400_000;

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function parseIsoDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== date ? null : parsed;
}

/** The viewer's calendar day, as a UTC midnight. */
function startOfToday(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Sunday of the week holding `date`'s calendar day. */
export function getWeekStart(date: Date): Date {
  const start = startOfToday(date);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

export function resolvePayPeriodRange(
  anchorDate: string | null | undefined,
  now: Date = new Date(),
): PeriodRange | null {
  const anchor = anchorDate ? parseIsoDate(anchorDate) : null;
  if (!anchor) return null;
  const diffDays = Math.floor((startOfToday(now).getTime() - anchor.getTime()) / DAY_MS);
  const periodStart = addDays(anchor, Math.floor(diffDays / PAY_PERIOD_DAYS) * PAY_PERIOD_DAYS);
  return {
    startDate: toIsoDate(periodStart),
    endDate: toIsoDate(addDays(periodStart, PAY_PERIOD_DAYS - 1)),
  };
}

/** The range a preset covers today, or null for Custom and for an unset pay period. */
export function resolvePeriodPreset(
  preset: PeriodPreset,
  payPeriodStartDate: string | null | undefined,
  now: Date = new Date(),
): PeriodRange | null {
  const weekStart = getWeekStart(now);
  switch (preset) {
    case "current-week":
      return { startDate: toIsoDate(weekStart), endDate: toIsoDate(addDays(weekStart, 6)) };
    case "pay-period":
      return resolvePayPeriodRange(payPeriodStartDate, now);
    case "this-month": {
      const today = startOfToday(now);
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      return { startDate: toIsoDate(first), endDate: toIsoDate(last) };
    }
    case "last-12-weeks":
      return {
        startDate: toIsoDate(addDays(weekStart, -84)),
        endDate: toIsoDate(addDays(weekStart, -1)),
      };
    case "custom":
      return null;
  }
}

/** Days a range covers, counting both ends; 0 when it is malformed or backwards. */
export function countRangeDays(range: PeriodRange): number {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  if (!start || !end || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

export function isValidCustomRange(range: PeriodRange): boolean {
  const days = countRangeDays(range);
  return days > 0 && days <= MAX_CUSTOM_RANGE_DAYS;
}

export function formatCompactRangeLabel(range: PeriodRange): string {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  if (!start || !end) return `${range.startDate} - ${range.endDate}`;
  const dateOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  if (start.getUTCFullYear() !== end.getUTCFullYear()) dateOptions.year = "numeric";
  const formatter = new Intl.DateTimeFormat("en-US", dateOptions);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

/**
 * Select options naming each preset with its dates, such as
 * "Pay period (Oct 19 - Nov 1)". Custom shows its dates once one is chosen.
 */
export function buildPeriodOptions<T extends PeriodPreset>(
  presets: readonly T[],
  customRange: PeriodRange,
  payPeriodStartDate: string | null | undefined,
  customRangeSelected: boolean,
  now: Date = new Date(),
): Array<{ value: T; label: string }> {
  return presets.map((preset) => {
    const baseLabel = PERIOD_PRESET_LABELS[preset];
    if (preset === "custom" && !customRangeSelected) return { value: preset, label: baseLabel };
    const resolved =
      preset === "custom" ? customRange : resolvePeriodPreset(preset, payPeriodStartDate, now);
    const rangeLabel = resolved ? formatCompactRangeLabel(resolved) : "not set";
    return { value: preset, label: `${baseLabel} (${rangeLabel})` };
  });
}
