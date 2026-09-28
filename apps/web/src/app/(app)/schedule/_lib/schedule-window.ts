import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import type { NotePublishChange, ScheduleNote } from "@/types";

/**
 * Notes for a schedule cell, keyed by `empId_date` or `empId_date_focusAreaId`.
 *
 * The focus-area-qualified key is the normal case; a note with a null
 * focusAreaId falls back to the two-part key. Both readers in the grid look up
 * the qualified key first, so the shapes must not diverge.
 */
export type ScheduleNoteMap = Record<
  string,
  {
    indicatorTypeId: number;
    status: "published" | "draft" | "draft_deleted";
    /** Last editor, so unpublished notes can be attributed at publish time. */
    updatedBy: string | null;
    /** The shift the note belongs to; absent from a peer's broadcast that predates 063. */
    shiftId?: number | null;
    jobId?: number | null;
  }[]
>;

export function scheduleNoteKey(empId: string, date: string, focusAreaId: number | null): string {
  return focusAreaId != null ? `${empId}_${date}_${focusAreaId}` : `${empId}_${date}`;
}

/**
 * Drops every note a cell holds, mirroring what the schedule API now does when
 * a shift is deleted, moved or swapped away. One cell can own several entries
 * because the key carries the focus area, so this cannot be a single delete.
 * Returns the original map when there was nothing to remove, keeping the
 * commit path's "did anything change" identity check meaningful.
 */
export function removeScheduleNotesForCell(
  notes: ScheduleNoteMap,
  empId: string,
  date: string,
): ScheduleNoteMap {
  const cellKey = scheduleNoteKey(empId, date, null);
  const focusAreaPrefix = `${cellKey}_`;
  const next: ScheduleNoteMap = {};
  let removed = false;

  for (const [key, entries] of Object.entries(notes)) {
    if (key === cellKey || key.startsWith(focusAreaPrefix)) {
      removed = true;
      continue;
    }
    next[key] = entries;
  }

  return removed ? next : notes;
}

/**
 * Groups the flat note rows the API returns into the per-cell map the grid reads.
 *
 * Extracted because the initial page load and every subsequent refetch each had
 * their own verbatim copy of this loop, so a change to the key shape had two
 * places to miss.
 */
export function buildScheduleNoteMap(noteRows: ScheduleNote[]): ScheduleNoteMap {
  const noteMap: ScheduleNoteMap = {};
  for (const note of noteRows) {
    const key = scheduleNoteKey(note.empId, note.date, note.focusAreaId);
    if (!noteMap[key]) noteMap[key] = [];
    noteMap[key].push({
      indicatorTypeId: note.indicatorTypeId,
      status: note.status,
      updatedBy: note.updatedBy,
      shiftId: note.shiftId,
      jobId: note.jobId,
    });
  }
  return noteMap;
}

/**
 * The dots for one cell's notes, each carrying its publication state.
 *
 * A note sits outside the schedule-cell snapshot, so no pill border, tone or
 * change chip moves when one is added or removed - the dot is the only place
 * that can say so. Unpublished state is scheduler-only, the same way draft
 * shift state is: to everyone else a note pending removal is simply still
 * there, and one pending addition is not there yet. No removal is ever drawn,
 * pending or just published: a dot for a note that is no longer there read as
 * one that still was.
 */
export function buildScheduleNoteMarks(input: {
  notes: ScheduleNoteMap[string] | undefined;
  publishedChanges?: Map<number, NotePublishChange>;
  isScheduleEditor: boolean;
}): ScheduleNoteMark[] {
  const noteList = input.notes ?? [];
  const marks: ScheduleNoteMark[] = [];
  // The dots are per cell, so a note on both shifts of a double shift is one dot.
  const seen = new Set<string>();
  const push = (mark: ScheduleNoteMark) => {
    const key = `${mark.indicatorTypeId}_${mark.state}`;
    if (seen.has(key)) return;
    seen.add(key);
    marks.push(mark);
  };

  for (const note of noteList) {
    if (note.status !== "published" && !input.isScheduleEditor) {
      if (note.status === "draft") continue;
      push({ indicatorTypeId: note.indicatorTypeId, state: "published" });
      continue;
    }

    if (note.status === "draft") {
      push({ indicatorTypeId: note.indicatorTypeId, state: "draft_added" });
      continue;
    }
    if (note.status === "draft_deleted") continue;
    push({
      indicatorTypeId: note.indicatorTypeId,
      state:
        input.publishedChanges?.get(note.indicatorTypeId)?.kind === "new"
          ? "published_added"
          : "published",
    });
  }

  return marks;
}

/**
 * The indicator types the printed page shows, for its indicator key: notes for
 * the given people and dates only, and what that viewer sees there. Editors see
 * their drafts, including a pending removal (the grid still draws it); everyone
 * else sees what is published (the server has already dropped drafts for them).
 */
export function indicatorIdsInNotes(
  notes: ScheduleNoteMap,
  isScheduleEditor: boolean,
  scope: { empIds: ReadonlySet<string>; dateKeys: ReadonlySet<string> },
): Set<number> {
  const ids = new Set<number>();
  for (const [key, cellNotes] of Object.entries(notes)) {
    const [empId, dateKey] = key.split("_");
    if (!scope.empIds.has(empId) || !scope.dateKeys.has(dateKey)) continue;
    for (const note of cellNotes) {
      if (isScheduleEditor || note.status !== "draft") ids.add(note.indicatorTypeId);
    }
  }
  return ids;
}

/**
 * The cells this tab has written, each stamped with the generation it was
 * written at. A fetch that began before a write can resolve after it with the
 * cell's pre-write state, and applying that wholesale erased a just-saved draft
 * until the next refetch.
 */
export interface LocalWriteLedger {
  generation: number;
  touched: Map<string, number>;
}

export function createLocalWriteLedger(): LocalWriteLedger {
  return { generation: 0, touched: new Map() };
}

/** `cellKeys` are `empId_date`, the shift map's key. */
export function markLocalWrite(ledger: LocalWriteLedger, cellKeys: Iterable<string>): void {
  ledger.generation += 1;
  for (const key of cellKeys) ledger.touched.set(key, ledger.generation);
}

function isCellNoteKey(noteKey: string, cellKey: string): boolean {
  return noteKey === cellKey || noteKey.startsWith(`${cellKey}_`);
}

/**
 * A fetched window with this tab's newer cells kept: any cell written after the
 * fetch began (`startedAt`, the ledger generation then) or still being written
 * keeps its current shift and notes, and everything else takes the server's.
 */
export function reconcileFetchedWindow<Shift>(input: {
  fetched: { shifts: Record<string, Shift>; notes: ScheduleNoteMap };
  current: { shifts: Record<string, Shift>; notes: ScheduleNoteMap };
  ledger: LocalWriteLedger;
  startedAt: number;
  pendingCellKeys: Iterable<string>;
}): { shifts: Record<string, Shift>; notes: ScheduleNoteMap } {
  const keep = new Set(input.pendingCellKeys);
  for (const [key, generation] of input.ledger.touched) {
    if (generation > input.startedAt) keep.add(key);
  }
  if (keep.size === 0) return input.fetched;

  const shifts = { ...input.fetched.shifts };
  const notes = { ...input.fetched.notes };
  for (const cellKey of keep) {
    if (cellKey in input.current.shifts) shifts[cellKey] = input.current.shifts[cellKey];
    else delete shifts[cellKey];
    for (const noteKey of Object.keys(notes)) {
      if (isCellNoteKey(noteKey, cellKey)) delete notes[noteKey];
    }
    for (const [noteKey, entries] of Object.entries(input.current.notes)) {
      if (isCellNoteKey(noteKey, cellKey)) notes[noteKey] = entries;
    }
  }
  return { shifts, notes };
}
