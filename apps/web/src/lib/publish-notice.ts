import { parseLocalDateKey } from "@dubgrid/schedule-core";
import { mergeCellPublishChanges } from "@/lib/shift-change-web";
import type { PublishChange, PublishHistoryEntry } from "@/types";

type NoticeEntry = Pick<PublishHistoryEntry, "publishedAt" | "changes">;

/** The days named before the rest are counted ("and 2 more days"). */
const NAMED_DAY_LIMIT = 3;

/** "Tue, Nov 3" for a `YYYY-MM-DD` key. */
export function formatDayLabel(dateKey: string): string {
  return parseLocalDateKey(dateKey).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The days, sorted, on which the viewer's own shifts changed across these
 * publishes. Each day is folded oldest to newest the way the grid folds it, so
 * a shift changed and changed back is no change, and a period's first
 * publication is the baseline rather than a change. Reads only whose cell and
 * which day, which the server sends even when change details are hidden.
 */
export function ownChangedDays(entries: readonly NoticeEntry[], empId: string | null): string[] {
  if (!empId) return [];
  const byDay = new Map<string, PublishChange[]>();
  const oldestFirst = [...entries].sort((left, right) =>
    left.publishedAt.localeCompare(right.publishedAt),
  );
  for (const entry of oldestFirst) {
    for (const change of entry.changes) {
      if (change.empId !== empId) continue;
      byDay.set(change.date, [...(byDay.get(change.date) ?? []), change]);
    }
  }
  const days: string[] = [];
  for (const [day, changes] of byDay) {
    const merged = mergeCellPublishChanges(changes);
    if (!merged) continue;
    if (merged.kind === "new" && merged.isNewAddition === false) continue;
    days.push(day);
  }
  return days.sort();
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Your shifts changed on Tue, Nov 3 and Thu, Nov 5", or null with no days. */
export function describeOwnChangedDays(days: readonly string[]): string | null {
  if (days.length === 0) return null;
  const named = days.slice(0, NAMED_DAY_LIMIT).map(formatDayLabel);
  const rest = days.length - named.length;
  const list =
    rest > 0
      ? `${named.join(", ")} and ${rest} more day${rest === 1 ? "" : "s"}`
      : joinWithAnd(named);
  return `Your shifts changed on ${list}`;
}

export interface PublishPeriodGroup {
  key: string;
  startDate: string;
  endDate: string;
  /** Every change for an editor; the viewer's own changed days for anyone else. */
  changeCount: number;
}

/**
 * Publishes outside the period on screen, one group per published period. An
 * editor or publisher counts everyone's changes; anyone else counts the days
 * their own shifts changed, and a period with none of theirs is left out.
 */
export function groupPublishesByPeriod<
  TEntry extends NoticeEntry & Pick<PublishHistoryEntry, "startDate" | "endDate" | "changeCount">,
>(
  entries: readonly TEntry[],
  viewer: { seesOrgChanges: boolean; empId: string | null },
): PublishPeriodGroup[] {
  const byPeriod = new Map<string, TEntry[]>();
  for (const entry of entries) {
    const key = `${entry.startDate}_${entry.endDate}`;
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), entry]);
  }
  const groups: PublishPeriodGroup[] = [];
  for (const [key, periodEntries] of byPeriod) {
    const changeCount = viewer.seesOrgChanges
      ? periodEntries.reduce((sum, entry) => sum + entry.changeCount, 0)
      : ownChangedDays(periodEntries, viewer.empId).length;
    if (!viewer.seesOrgChanges && changeCount === 0) continue;
    const { startDate, endDate } = periodEntries[0]!;
    groups.push({ key, startDate, endDate, changeCount });
  }
  return groups.sort((left, right) => left.startDate.localeCompare(right.startDate));
}

/** The other-periods bar's summary, "3 changes in 2 other weeks" or "Your shifts changed in 1 other week". */
export function describeOtherPeriodPublishes(
  groups: readonly PublishPeriodGroup[],
  noun: string,
  seesOrgChanges: boolean,
): string {
  const periods = `${groups.length} other ${noun}${groups.length === 1 ? "" : "s"}`;
  if (!seesOrgChanges) return `Your shifts changed in ${periods}`;
  const total = groups.reduce((sum, group) => sum + group.changeCount, 0);
  return `${total} change${total === 1 ? "" : "s"} in ${periods}`;
}
