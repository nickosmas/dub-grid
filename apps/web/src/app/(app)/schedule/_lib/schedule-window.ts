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
 * there, and one pending addition is not there yet.
 */
export function buildScheduleNoteMarks(input: {
  notes: ScheduleNoteMap[string] | undefined;
  publishedChanges?: Map<number, NotePublishChange>;
  isScheduleEditor: boolean;
}): ScheduleNoteMark[] {
  const noteList = input.notes ?? [];
  const marks: ScheduleNoteMark[] = [];

  for (const note of noteList) {
    if (note.status !== "published" && !input.isScheduleEditor) {
      if (note.status === "draft") continue;
      marks.push({ indicatorTypeId: note.indicatorTypeId, state: "published" });
      continue;
    }

    if (note.status === "draft") {
      marks.push({ indicatorTypeId: note.indicatorTypeId, state: "draft_added" });
      continue;
    }
    if (note.status === "draft_deleted") {
      marks.push({ indicatorTypeId: note.indicatorTypeId, state: "draft_removed" });
      continue;
    }
    marks.push({
      indicatorTypeId: note.indicatorTypeId,
      state:
        input.publishedChanges?.get(note.indicatorTypeId)?.kind === "new"
          ? "published_added"
          : "published",
    });
  }

  for (const change of input.publishedChanges?.values() ?? []) {
    // A removed note has no row left, so its publish record is the only place
    // the indicator's name and colour still exist.
    if (change.kind !== "deleted") continue;
    if (noteList.some((note) => note.indicatorTypeId === change.indicatorTypeId)) continue;
    marks.push({
      indicatorTypeId: change.indicatorTypeId,
      state: "published_removed",
      name: change.indicatorName,
      color: change.indicatorColor,
    });
  }

  return marks;
}
