import type { PublishHistoryEntry } from "@/types";

/**
 * The history the publisher's banner and Highlight changes read right after
 * they publish: publications since they last opened the schedule, plus the
 * one just made.
 *
 * The request asks for the period on screen so a first visit has something to
 * show, and the API then returns the period's whole history. Without `since`
 * here, a shift published weeks ago read as New after any small publish.
 *
 * The recent-history API flags a period's first publication as the baseline
 * so readers are not shown every cell ringed, but for the person who
 * published, every cell they put live since they last looked is a change worth
 * highlighting: publishing an Auto-built week and then a fix to two of its
 * days otherwise unmarked the rest of the week. The newest entry is the row
 * the publish just created, so it is always theirs; another scheduler's
 * publications keep the reader rule.
 */
export function markOwnPublicationAsAdditions(
  entries: PublishHistoryEntry[],
  publisherId?: string | null,
  since?: string | null,
): PublishHistoryEntry[] {
  if (entries.length === 0) return entries;
  let newest = entries[0]!;
  for (const entry of entries) {
    if (entry.publishedAt > newest.publishedAt) newest = entry;
  }
  const sinceTime = since ? Date.parse(since) : Number.NaN;
  // A first visit has no "last opened" to measure from: only the publish just made is theirs.
  const hasSince = !Number.isNaN(sinceTime);
  const isRecent = (entry: PublishHistoryEntry) =>
    entry === newest || !hasSince || Date.parse(entry.publishedAt) > sinceTime;
  const isOwn = (entry: PublishHistoryEntry) =>
    entry === newest || (hasSince && !!publisherId && entry.publishedBy === publisherId);
  return entries.filter(isRecent).map((entry) =>
    !isOwn(entry)
      ? entry
      : {
          ...entry,
          changes: entry.changes.map((change) =>
            change.kind === "new" ? { ...change, isNewAddition: true } : change,
          ),
          noteChanges: entry.noteChanges?.map((change) =>
            change.kind === "new" ? { ...change, isNewAddition: true } : change,
          ),
        },
  );
}
