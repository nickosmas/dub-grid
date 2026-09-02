import {
  addDaysToIsoDate,
  getIsoDateInTimeZone,
  getScheduleWeekStartDate,
} from "@dubgrid/schedule-core";

import type { ScheduleCellStateEntry } from "@/types";

export const PROFILE_OVERVIEW_WEEK_COUNT = 12;

export interface ProfileOverviewDateRange {
  startDate: string;
  endDate: string;
}

export function getProfileOverviewDateRange(
  now = new Date(),
  timeZone?: string | null,
): ProfileOverviewDateRange {
  const currentWeekStart = getScheduleWeekStartDate(getIsoDateInTimeZone(now, timeZone));
  return {
    startDate: addDaysToIsoDate(currentWeekStart, -(PROFILE_OVERVIEW_WEEK_COUNT - 1) * 7),
    endDate: addDaysToIsoDate(currentWeekStart, 6),
  };
}

export function getProfileOverviewCurrentWeekDateKeys(range: ProfileOverviewDateRange): string[] {
  const currentWeekStart = addDaysToIsoDate(range.endDate, -6);
  return Array.from({ length: 7 }, (_, index) => addDaysToIsoDate(currentWeekStart, index));
}

export function toPublishedOnlyProfileEntry(entry: ScheduleCellStateEntry): ScheduleCellStateEntry {
  return {
    ...entry,
    draft: null,
    effective: entry.published ?? null,
    isDraft: false,
    isDelete: false,
    draftKind: null,
    version: undefined,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  };
}
