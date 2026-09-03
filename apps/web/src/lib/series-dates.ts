import type { SeriesFrequency } from "@/types";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";
import { iterateDateRange } from "@/lib/utils";

/** Generate recurring occurrence dates with UTC day arithmetic so DST cannot skip a day. */
export function generateSeriesDates(
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  const cap = maxOccurrences ?? MAX_SERIES_OCCURRENCES;
  const maxEnd = endDate
    ? new Date(`${endDate}T00:00:00`)
    : new Date(start.getFullYear(), start.getMonth() + 7, start.getDate());
  const startDayOfWeek = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  ).getUTCDay();

  for (const { dateKey, dayOfWeek, dayIndex } of iterateDateRange(start, maxEnd)) {
    if (dates.length >= cap) break;

    const dayMatch =
      daysOfWeek === null || daysOfWeek.length === 0
        ? dayOfWeek === startDayOfWeek
        : daysOfWeek.includes(dayOfWeek);
    const include =
      frequency === "daily" ||
      (frequency === "weekly" && dayMatch) ||
      (frequency === "biweekly" && Math.floor(dayIndex / 7) % 2 === 0 && dayMatch);

    if (include) dates.push(dateKey);
  }

  return dates;
}
