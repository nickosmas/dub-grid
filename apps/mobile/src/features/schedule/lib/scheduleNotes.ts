import type { MobileScheduleEntrySegment, MobileScheduleIndicator } from "@dubgrid/contracts";

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

export interface ScheduleNoteGroup {
  key: string;
  /** The half a group belongs to; null for a single shift's one group. */
  title: string | null;
  notes: MobileScheduleIndicator[];
}

export const WHOLE_DAY_NOTES_TITLE = "For the whole day";

/**
 * A shift's notes as shift detail lists them. A single shift has one untitled
 * group. A double shift has a group per focus area it works, titled with that
 * area, then the notes with no focus area (or one the shift no longer works)
 * under "For the whole day". Empty groups are left out.
 */
export function scheduleNoteGroups(
  notes: readonly MobileScheduleIndicator[] | undefined,
  segments: readonly MobileScheduleEntrySegment[],
): ScheduleNoteGroup[] {
  const all = scheduleNotesForRow(notes);
  if (segments.length <= 1) {
    return all.length > 0 ? [{ key: "shift", title: null, notes: all }] : [];
  }
  const groups: ScheduleNoteGroup[] = [];
  const worked = new Set<number>();
  for (const segment of segments) {
    const focusAreaId = segment.focusAreaId;
    if (typeof focusAreaId !== "number" || worked.has(focusAreaId)) continue;
    worked.add(focusAreaId);
    const own = all.filter((note) => note.focusAreaId === focusAreaId);
    if (own.length === 0) continue;
    groups.push({
      key: `area-${focusAreaId}`,
      title: segment.displayFocusAreaName?.trim() || segment.shiftName?.trim() || "Shift",
      notes: own,
    });
  }
  const rest = all.filter((note) => note.focusAreaId === null || !worked.has(note.focusAreaId));
  if (rest.length > 0) {
    groups.push({ key: "whole-day", title: WHOLE_DAY_NOTES_TITLE, notes: rest });
  }
  return groups;
}
