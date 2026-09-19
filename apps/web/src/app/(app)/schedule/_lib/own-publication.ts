import type { PublishHistoryEntry } from "@/types";

/**
 * The publisher's post-publish banner answers "what did this publish do", not
 * "what changed since you last looked". The recent-history API flags a
 * period's first publication as the baseline so readers are not shown every
 * cell ringed, but for the person who just published, every cell that went
 * live is a change worth highlighting. Flip the newest entry, which is the
 * row the publish just created; older entries keep the reader rule.
 */
export function markOwnPublicationAsAdditions(
  entries: PublishHistoryEntry[],
): PublishHistoryEntry[] {
  if (entries.length === 0) return entries;
  let newest = entries[0]!;
  for (const entry of entries) {
    if (entry.publishedAt > newest.publishedAt) newest = entry;
  }
  return entries.map((entry) =>
    entry !== newest
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
