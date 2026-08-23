import type { ScheduleNote } from "@/types";

/**
 * Notes for a schedule cell, keyed by `empId_date` or `empId_date_focusAreaId`.
 *
 * The focus-area-qualified key is the normal case; a note with a null
 * focusAreaId falls back to the two-part key. Both readers in the grid look up
 * the qualified key first, so the shapes must not diverge.
 */
export type ScheduleNoteMap = Record<
  string,
  { indicatorTypeId: number; status: "published" | "draft" | "draft_deleted" }[]
>;

export function scheduleNoteKey(empId: string, date: string, focusAreaId: number | null): string {
  return focusAreaId != null ? `${empId}_${date}_${focusAreaId}` : `${empId}_${date}`;
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
    noteMap[key].push({ indicatorTypeId: note.indicatorTypeId, status: note.status });
  }
  return noteMap;
}
