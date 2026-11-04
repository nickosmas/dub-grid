import { addDaysToIsoDate } from "@dubgrid/schedule-core";

export interface ImportPreviousRange {
  sourceStart: string;
  sourceEnd: string;
  targetStart: string;
  targetEnd: string;
  /** The period on screen starts before today, so its earlier days are left out. */
  skipsPastDays: boolean;
}

/**
 * The days Import Previous Schedule copies into the period on screen: each
 * day from today on takes the same day of the period before. Days before
 * today are corrected, not drafted, and the server skips them too (118).
 * Null when every day on screen is before today.
 */
export function importPreviousRange(
  periodStart: string,
  days: number,
  today: string,
): ImportPreviousRange | null {
  const targetEnd = addDaysToIsoDate(periodStart, days - 1);
  if (targetEnd < today) return null;
  const targetStart = periodStart < today ? today : periodStart;
  return {
    sourceStart: addDaysToIsoDate(targetStart, -days),
    sourceEnd: addDaysToIsoDate(targetEnd, -days),
    targetStart,
    targetEnd,
    skipsPastDays: targetStart !== periodStart,
  };
}
