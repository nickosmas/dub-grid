import { parseLocalDateKey } from "@dubgrid/schedule-core";
import type { PublishChange } from "@/types";

type NoticeChange = Pick<PublishChange, "empId" | "date" | "kind" | "isNewAddition">;

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

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A viewer's own changed cells. A period's first publication is the baseline
 * the grid paints nothing for, so it isn't a change to them either.
 */
export function ownPublishChanges<T extends NoticeChange>(changes: T[], empId: string | null): T[] {
  if (!empId) return [];
  return changes.filter(
    (change) =>
      change.empId === empId && !(change.kind === "new" && change.isNewAddition === false),
  );
}

/** The sorted, distinct days a set of changes falls on. */
export function changedDayKeys(changes: NoticeChange[]): string[] {
  return [...new Set(changes.map((change) => change.date))].sort();
}

/** "Your shifts changed on Tue, Nov 3 and Thu, Nov 5", or null when none of theirs did. */
export function describeOwnPublishChanges(
  changes: NoticeChange[],
  empId: string | null,
): string | null {
  const days = changedDayKeys(ownPublishChanges(changes, empId));
  if (days.length === 0) return null;
  const named = days.slice(0, NAMED_DAY_LIMIT).map(formatDayLabel);
  const rest = days.length - named.length;
  const list =
    rest > 0
      ? `${named.join(", ")} and ${rest} more day${rest === 1 ? "" : "s"}`
      : joinWithAnd(named);
  return `Your shifts changed on ${list}`;
}

/** The organization-wide count an editor sees, or null when nothing changed. */
export function describeOrgPublishChanges(changes: NoticeChange[]): string | null {
  const counts = { new: 0, modified: 0, deleted: 0 };
  for (const change of changes) counts[change.kind] += 1;
  const parts = [
    counts.new > 0 ? `${counts.new} new` : null,
    counts.modified > 0 ? `${counts.modified} changed` : null,
    counts.deleted > 0 ? `${counts.deleted} removed` : null,
  ].filter((part): part is string => part != null);
  if (parts.length === 0) return null;
  return `${changes.length} shift${changes.length === 1 ? "" : "s"} changed since your last visit: ${parts.join(", ")}`;
}

/** The toast after a publish: everyone's changes for whoever edits or publishes, only their own for staff. */
export function describePublishNotice(
  changes: NoticeChange[],
  viewer: { seesOrgChanges: boolean; empId: string | null },
): string | null {
  return viewer.seesOrgChanges
    ? describeOrgPublishChanges(changes)
    : describeOwnPublishChanges(changes, viewer.empId);
}
