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

export const WHOLE_DAY_NOTES_TITLE = "For the whole day";

/** The half a note belongs to, or -1 for a note no half claims (or one the shift no longer has). */
function claimingSegment(
  note: MobileScheduleIndicator,
  segments: readonly MobileScheduleEntrySegment[],
): number {
  if (note.jobId == null) return -1;
  return segments.findIndex(
    (segment) =>
      segment.jobId === note.jobId && (segment.shiftId ?? null) === (note.shiftId ?? null),
  );
}

function sharesFocusArea(segments: readonly MobileScheduleEntrySegment[], index: number): boolean {
  const focusAreaId = segments[index]?.focusAreaId;
  return (
    typeof focusAreaId === "number" &&
    segments.some((segment, other) => other !== index && segment.focusAreaId === focusAreaId)
  );
}

/**
 * A shift's notes as shift detail lists them. A single shift has one untitled
 * group. A double shift lists each focus area it works under that area's name,
 * with the notes of the half working it and the notes no shift claims. Where
 * both halves work one area, each half's own notes get a group titled with its
 * shift instead, so they stay apart. Notes with no focus area (or one the shift
 * no longer works) come last, under "For the whole day". Empty groups are left
 * out.
 */
export function scheduleNoteGroups(
  notes: readonly MobileScheduleIndicator[] | undefined,
  segments: readonly MobileScheduleEntrySegment[],
): ScheduleNoteGroup[] {
  if (segments.length <= 1) {
    const all = scheduleNotesForRow(notes);
    return all.length > 0 ? [{ key: "shift", title: null, notes: all }] : [];
  }
  // Grouped before deduplicating: the same note type on two halves, or filed
  // under two focus areas, belongs to both.
  const raw = notes ?? [];
  const claimedBy = new Map(raw.map((note) => [note, claimingSegment(note, segments)]));
  const groups: ScheduleNoteGroup[] = [];
  const worked = new Set<number>();
  segments.forEach((segment, index) => {
    const focusAreaId = segment.focusAreaId;
    const areaName = segment.displayFocusAreaName?.trim();
    const shiftName = segment.shiftName?.trim();
    const shared = sharesFocusArea(segments, index);
    const own = raw.filter((note) => claimedBy.get(note) === index);
    if (shared && own.length > 0) {
      groups.push({
        key: `shift-${index}`,
        title: shiftName || areaName || "Shift",
        notes: scheduleNotesForRow(own),
      });
    }
    if (typeof focusAreaId !== "number" || worked.has(focusAreaId)) return;
    worked.add(focusAreaId);
    const area = scheduleNotesForRow([
      ...(shared ? [] : own),
      ...raw.filter((note) => claimedBy.get(note) === -1 && note.focusAreaId === focusAreaId),
    ]);
    if (area.length === 0) return;
    groups.push({
      key: `area-${focusAreaId}`,
      title: areaName || shiftName || "Shift",
      notes: area,
    });
  });
  const rest = scheduleNotesForRow(
    raw.filter(
      (note) =>
        claimedBy.get(note) === -1 && (note.focusAreaId === null || !worked.has(note.focusAreaId)),
    ),
  );
  if (rest.length > 0) {
    groups.push({ key: "whole-day", title: WHOLE_DAY_NOTES_TITLE, notes: rest });
  }
  return groups;
}

/**
 * The notes one half of a shift lists, matching shift detail so each note
 * shows once across the halves: a half lists its own notes, the first half
 * working a focus area lists the notes no shift claims there, and the first
 * half also lists the whole day's.
 */
export function scheduleNotesForSegment(
  notes: readonly MobileScheduleIndicator[] | undefined,
  segments: readonly MobileScheduleEntrySegment[],
  segmentIndex: number,
): MobileScheduleIndicator[] {
  const groups = scheduleNoteGroups(notes, segments);
  if (segments.length <= 1) return groups[0]?.notes ?? [];
  const group = (key: string) => groups.find((candidate) => candidate.key === key)?.notes ?? [];
  const focusAreaId = segments[segmentIndex]?.focusAreaId;
  const ownsArea =
    typeof focusAreaId === "number" &&
    segments.findIndex((segment) => segment.focusAreaId === focusAreaId) === segmentIndex;
  return [
    ...group(`shift-${segmentIndex}`),
    ...(ownsArea ? group(`area-${focusAreaId}`) : []),
    ...(segmentIndex === 0 ? group("whole-day") : []),
  ];
}

/** What a screen reader says for a list of notes, since a row reads its children's labels only. */
export function scheduleNotesSpokenLabel(notes: readonly MobileScheduleIndicator[]): string {
  return `Schedule notes: ${notes.map(scheduleNoteLabel).join("; ")}`;
}
