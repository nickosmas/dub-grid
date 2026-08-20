import type {
  MobileFocusArea,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
} from "@dubgrid/contracts";
import {
  TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY,
  type MobileScheduleSection,
  type MobileScheduleShiftGroup,
  type ScheduleEntryLike,
  type TeamScheduleFocusAreaTab,
} from "./types";
import { formatScheduleDayLabel, formatScheduleSectionSubtitle } from "./dates";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCustomStartTime,
  getScheduleEntryFocusAreaId,
  getScheduleEntryFocusAreaName,
  getScheduleEntrySegments,
  getScheduleEntryStartTime,
  getScheduleEntryTitle,
} from "./entry-accessors";
import { getSortableTime, sortScheduleEntries } from "./schedule-time";

export function getScheduleEntryCategoryKey(entry: ScheduleEntryLike): string {
  const title = getScheduleEntryTitle(entry);

  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return `absence:${getScheduleEntryAbsenceTypeId(entry)}:${title}`;
  }

  const canonicalSegments = entry.state?.segments ?? [];
  const shiftIds =
    canonicalSegments.length > 0
      ? canonicalSegments.map((segment) =>
          segment.shiftId == null ? "null" : String(segment.shiftId),
        )
      : (entry.shiftIds ?? []).map((shiftId) => (shiftId == null ? "null" : String(shiftId)));
  if (shiftIds.some((shiftId) => shiftId !== "null")) {
    return `shift:${shiftIds.join(",")}`;
  }

  return `name:${title}`;
}

function getShiftOnlySegmentTitle(segment: MobileScheduleEntrySegment): string | null {
  const title = segment.shiftName ?? segment.label ?? null;
  const jobName = segment.jobName?.trim();

  if (!title) {
    return null;
  }

  if (jobName && title.endsWith(` ${jobName}`)) {
    return title.slice(0, -jobName.length).trim();
  }

  return title;
}

function getScheduleEntryPrimaryJobSort(entry: ScheduleEntryLike): {
  sortOrder: number;
  name: string;
} {
  const segment =
    getScheduleEntrySegments(entry).find((item) => item.jobName) ??
    getScheduleEntrySegments(entry)[0] ??
    null;

  return {
    sortOrder: segment?.jobSortOrder ?? Number.MAX_SAFE_INTEGER,
    name: segment?.jobName ?? "",
  };
}

function getScheduleEntrySeniority(entry: ScheduleEntryLike): number {
  return entry.employeeSeniority ?? Number.MAX_SAFE_INTEGER;
}

function sortTeamShiftGroupEntries(entries: MobileScheduleEntry[]): MobileScheduleEntry[] {
  return [...entries].sort((left, right) => {
    const leftJob = getScheduleEntryPrimaryJobSort(left);
    const rightJob = getScheduleEntryPrimaryJobSort(right);

    if (leftJob.sortOrder !== rightJob.sortOrder) {
      return leftJob.sortOrder - rightJob.sortOrder;
    }

    const jobComparison = leftJob.name.localeCompare(rightJob.name);
    if (jobComparison !== 0) {
      return jobComparison;
    }

    const seniorityComparison = getScheduleEntrySeniority(left) - getScheduleEntrySeniority(right);
    if (seniorityComparison !== 0) {
      return seniorityComparison;
    }

    return left.employeeName.localeCompare(right.employeeName);
  });
}

export function getScheduleEntryCategoryTitle(entry: ScheduleEntryLike): string {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return getScheduleEntryTitle(entry);
  }

  const shiftTitles = getScheduleEntrySegments(entry)
    .map(getShiftOnlySegmentTitle)
    .filter((title): title is string => Boolean(title))
    .filter((title, index, titles) => titles.indexOf(title) === index);

  return shiftTitles.length > 0 ? shiftTitles.join(" / ") : getScheduleEntryTitle(entry);
}

export function buildScheduleShiftGroups(
  entries: ReadonlyArray<ScheduleEntryLike>,
): MobileScheduleShiftGroup[] {
  const grouped = new Map<
    string,
    {
      title: string;
      sortKey: string;
      entries: MobileScheduleEntry[];
    }
  >();

  const sortedEntries = sortScheduleEntries(entries);

  for (const entry of sortedEntries) {
    const key = getScheduleEntryCategoryKey(entry);
    const sortTime =
      getSortableTime(getScheduleEntryStartTime(entry) ?? getScheduleEntryCustomStartTime(entry)) ??
      "99:99:99";
    const existing = grouped.get(key) ?? {
      title: getScheduleEntryCategoryTitle(entry),
      sortKey: sortTime,
      entries: [],
    };

    if (sortTime.localeCompare(existing.sortKey) < 0) {
      existing.sortKey = sortTime;
    }

    existing.entries.push(entry as MobileScheduleEntry);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => {
      const sortComparison = left[1].sortKey.localeCompare(right[1].sortKey);
      if (sortComparison !== 0) {
        return sortComparison;
      }

      return left[1].title.localeCompare(right[1].title);
    })
    .map(([key, value]) => ({
      key,
      title: value.title,
      entries: sortTeamShiftGroupEntries(value.entries),
    }));
}

/**
 * People, not rows: an employee working a split shift has several entries on
 * the same day and must still count once.
 */
function countFocusAreaPeople(
  entries: ReadonlyArray<ScheduleEntryLike>,
  focusAreaId: number,
): number {
  const employeeIds = new Set<string>();

  for (const entry of entries) {
    if (getScheduleEntryFocusAreaId(entry) === focusAreaId) {
      employeeIds.add(entry.employeeId);
    }
  }

  return employeeIds.size;
}

/**
 * @param entries Decides which tabs exist. Pass the whole loaded range so the
 *   tab set stays put as the user moves between days.
 * @param countEntries Decides each badge number. Pass just the selected day —
 *   counting the full range instead multiplies every badge by the number of
 *   days loaded, since the same person recurs on each one. Defaults to
 *   `entries` so existing callers keep their current behaviour.
 */
export function buildTeamScheduleFocusAreaTabs(
  focusAreas: ReadonlyArray<MobileFocusArea>,
  entries: ReadonlyArray<ScheduleEntryLike>,
  countEntries: ReadonlyArray<ScheduleEntryLike> = entries,
): TeamScheduleFocusAreaTab[] {
  if (entries.length === 0 && focusAreas.length === 0) {
    return [];
  }

  const focusAreasById = new Map<number, MobileFocusArea>();

  for (const focusArea of focusAreas) {
    focusAreasById.set(focusArea.id, focusArea);
  }

  for (const entry of entries) {
    const focusAreaId = getScheduleEntryFocusAreaId(entry);
    const focusAreaName = getScheduleEntryFocusAreaName(entry);
    if (focusAreaId != null && focusAreaName && !focusAreasById.has(focusAreaId)) {
      focusAreasById.set(focusAreaId, {
        id: focusAreaId,
        name: focusAreaName,
      });
    }
  }

  const tabs = Array.from(focusAreasById.values()).map((focusArea) => ({
    key: `focus-area:${focusArea.id}`,
    label: focusArea.name,
    count: countFocusAreaPeople(countEntries, focusArea.id),
    focusAreaId: focusArea.id,
  }));

  if (focusAreas.length > 0) {
    return tabs;
  }

  return tabs.filter((tab) => tab.count > 0);
}

export function filterTeamScheduleEntriesByFocusArea(
  entries: ReadonlyArray<ScheduleEntryLike>,
  activeTabKey: string,
): MobileScheduleEntry[] {
  // If no key or 'all', return all entries unfiltered
  if (activeTabKey === TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY) {
    return [...entries] as MobileScheduleEntry[];
  }

  const match = /^focus-area:(\d+)$/.exec(activeTabKey);
  if (!match) {
    return [...entries] as MobileScheduleEntry[];
  }

  const focusAreaId = Number(match[1]);
  return entries.filter(
    (entry) => getScheduleEntryFocusAreaId(entry) === focusAreaId,
  ) as MobileScheduleEntry[];
}

export function buildScheduleSections(
  entries: ReadonlyArray<ScheduleEntryLike>,
  scope: "mine" | "team",
  timeZone?: string | null,
): MobileScheduleSection[] {
  const grouped = new Map<string, MobileScheduleEntry[]>();

  for (const entry of [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    const leftTime = getSortableTime(
      getScheduleEntryStartTime(left) ?? getScheduleEntryCustomStartTime(left),
    );
    const rightTime = getSortableTime(
      getScheduleEntryStartTime(right) ?? getScheduleEntryCustomStartTime(right),
    );
    if (leftTime !== rightTime) {
      if (!leftTime) return 1;
      if (!rightTime) return -1;
      return leftTime.localeCompare(rightTime);
    }

    return left.employeeName.localeCompare(right.employeeName);
  })) {
    const existing = grouped.get(entry.date) ?? [];
    existing.push(entry as MobileScheduleEntry);
    grouped.set(entry.date, existing);
  }

  return Array.from(grouped.entries()).map(([date, groupedEntries]) => ({
    date,
    title: formatScheduleDayLabel(date, new Date(), timeZone),
    subtitle: formatScheduleSectionSubtitle(groupedEntries.length, scope),
    entries: groupedEntries,
  }));
}
