import type { ShiftChange } from "@dubgrid/schedule-core";

/** A day's change under an Away bar, as its cell's own badge would name it. */
export type AwayRunChangeKind = "new" | "modified" | "deleted";

export interface AwayRunDayChange {
  dateKey: string;
  kind: AwayRunChangeKind;
  /** Before and After, when both sides are known. */
  view: ShiftChange | null;
}

/**
 * The changes on an Away bar's days: drafts a status change wrote that aren't
 * published yet, and published changes while Highlight changes is on. A bar
 * covers its cells, so it carries their marks instead.
 */
export interface AwayRunChanges {
  draft: AwayRunDayChange[];
  published: AwayRunDayChange[];
}

export interface AwayRunChip {
  kind: AwayRunChangeKind;
  /** "Removed ×3"; a single day shows the word alone, as a run's label does. */
  text: string;
}

const KIND_ORDER: readonly AwayRunChangeKind[] = ["new", "modified", "deleted"];
const KIND_WORDS: Record<AwayRunChangeKind, string> = {
  new: "New",
  modified: "Changed",
  deleted: "Removed",
};

/** One chip per kind of change among the days, in the draft banner's order. */
export function awayRunChips(changes: readonly Pick<AwayRunDayChange, "kind">[]): AwayRunChip[] {
  return KIND_ORDER.flatMap((kind) => {
    const count = changes.filter((change) => change.kind === kind).length;
    if (count === 0) return [];
    return [{ kind, text: count === 1 ? KIND_WORDS[kind] : `${KIND_WORDS[kind]} ×${count}` }];
  });
}

/** What a screen reader hears for the bar's changes: "3 shifts removed in the draft". */
export function describeAwayRunChanges(changes: AwayRunChanges): string | null {
  const parts = [
    changes.draft.length > 0 ? `${chipPhrase(changes.draft)}, not published yet` : null,
    changes.published.length > 0 ? `${chipPhrase(changes.published)}, published` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join("; ") : null;
}

function chipPhrase(changes: readonly AwayRunDayChange[]): string {
  return awayRunChips(changes)
    .map((chip) => chip.text.replace(" ×", " ").toLowerCase())
    .map((text) => {
      const [word, count] = text.split(" ");
      return count ? `${count} days ${word}` : `1 day ${word}`;
    })
    .join(", ");
}
