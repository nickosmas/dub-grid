import type { MobileScheduleIndicator } from "@dubgrid/contracts";

/**
 * The schedule notes a row shows. With a focus area, the notes filed under it
 * and those with no focus area; without one, all of them. Each note appears
 * once, in the order the server sent it.
 */
export function scheduleNotesForRow(
  notes: readonly MobileScheduleIndicator[] | undefined,
  focusAreaId?: number | null,
): MobileScheduleIndicator[] {
  const seen = new Set<string>();
  const shown: MobileScheduleIndicator[] = [];
  for (const note of notes ?? []) {
    if (focusAreaId != null && note.focusAreaId !== null && note.focusAreaId !== focusAreaId) {
      continue;
    }
    const key = `${note.indicatorTypeId}_${note.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    shown.push(note);
  }
  return shown;
}

const STATE_WORDS: Record<MobileScheduleIndicator["state"], string | null> = {
  published: null,
  draft_added: "added, not published",
  draft_removed: "removed, not published",
};

/** The words after a note's name; editors alone ever see a draft. */
export function scheduleNoteStateWords(state: MobileScheduleIndicator["state"]): string | null {
  return STATE_WORDS[state];
}

/** A note as it is read aloud and shown: its name, then any draft state. */
export function scheduleNoteLabel(note: MobileScheduleIndicator): string {
  const words = scheduleNoteStateWords(note.state);
  return words ? `${note.name}, ${words}` : note.name;
}

/**
 * The swatch beside a note's name. A draft addition is faded and a draft
 * removal is a hollow ring, since mobile marks carry no dashed borders.
 */
export function scheduleNoteSwatchStyle(
  note: Pick<MobileScheduleIndicator, "color" | "state">,
  ringColor: string,
): { backgroundColor: string; borderColor: string; borderWidth: number; opacity: number } {
  if (note.state === "draft_removed") {
    return {
      backgroundColor: "transparent",
      borderColor: note.color,
      borderWidth: 1.5,
      opacity: 1,
    };
  }
  return {
    backgroundColor: note.color,
    borderColor: ringColor,
    borderWidth: 1,
    opacity: note.state === "draft_added" ? 0.45 : 1,
  };
}
