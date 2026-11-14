import type { PublishHistoryEntry } from "@/types";

/**
 * The publisher's post-publish banner answers "what did my publishing do", not
 * "what changed since you last looked". The recent-history API flags a
 * period's first publication as the baseline so readers are not shown every
 * cell ringed, but for the person who published, every cell that went live is
 * a change worth highlighting.
 *
 * That holds for each of their publications the history returns, not only the
 * newest: publishing an Auto-built week and then a fix to two of its days
 * otherwise left every other shift of that week unmarked, and a cell changed
 * by both kept the first one's baseline flag through the merge and lost its
 * badge too. The newest entry is the row the publish just created, so it is
 * always the publisher's; another scheduler's publications keep the reader
 * rule.
 */
export function markOwnPublicationAsAdditions(
  entries: PublishHistoryEntry[],
  publisherId?: string | null,
): PublishHistoryEntry[] {
  if (entries.length === 0) return entries;
  let newest = entries[0]!;
  for (const entry of entries) {
    if (entry.publishedAt > newest.publishedAt) newest = entry;
  }
  const isOwn = (entry: PublishHistoryEntry) =>
    entry === newest || (!!publisherId && entry.publishedBy === publisherId);
  return entries.map((entry) =>
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
