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

export interface ScheduleNoteGroup {
  key: string;
  /** The half a group belongs to; null for a single shift's one group. */
  title: string | null;
  notes: MobileScheduleIndicator[];
}

function isOnSegment(note: MobileScheduleIndicator, segment: MobileScheduleEntrySegment): boolean {
  return (
    note.jobId != null &&
    segment.jobId === note.jobId &&
    (segment.shiftId ?? null) === (note.shiftId ?? null)
  );
}

/**
 * A shift's notes as shift detail lists them. A single shift has one untitled
 * group. A double shift has a group per half, titled with its shift, holding
 * the notes that belong to it; a note always names its shift, so one naming a
 * shift the day no longer has shows nowhere. Empty groups are left out.
 */
export function scheduleNoteGroups(
  notes: readonly MobileScheduleIndicator[] | undefined,
  segments: readonly MobileScheduleEntrySegment[],
): ScheduleNoteGroup[] {
  if (segments.length <= 1) {
    const all = scheduleNotesForRow(notes);
    return all.length > 0 ? [{ key: "shift", title: null, notes: all }] : [];
  }
  return segments.flatMap((segment, index) => {
    const own = scheduleNotesForRow((notes ?? []).filter((note) => isOnSegment(note, segment)));
    if (own.length === 0) return [];
    const title = segment.shiftName?.trim() || segment.displayFocusAreaName?.trim() || "Shift";
    return [{ key: `shift-${index}`, title, notes: own }];
  });
}

/** The notes one half of a shift lists, matching shift detail. */
export function scheduleNotesForSegment(
  notes: readonly MobileScheduleIndicator[] | undefined,
  segments: readonly MobileScheduleEntrySegment[],
  segmentIndex: number,
): MobileScheduleIndicator[] {
  const groups = scheduleNoteGroups(notes, segments);
  if (segments.length <= 1) return groups[0]?.notes ?? [];
  return groups.find((group) => group.key === `shift-${segmentIndex}`)?.notes ?? [];
}

/** What a screen reader says for a list of notes, since a row reads its children's labels only. */
export function scheduleNotesSpokenLabel(notes: readonly MobileScheduleIndicator[]): string {
  return `Schedule notes: ${notes.map(scheduleNoteLabel).join("; ")}`;
}
