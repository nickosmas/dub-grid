export type ScheduleNoteStatus = "published" | "draft" | "draft_deleted";

/** Whether a viewer sees draft schedule indicators: whoever can edit shifts or notes. */
export function canSeeDraftScheduleNotes(permissions: {
  canEditShifts: boolean;
  canEditNotes: boolean;
}): boolean {
  return permissions.canEditShifts || permissions.canEditNotes;
}

/**
 * The schedule notes a viewer may see. Notes are read past the row policy by
 * the service client, so this is what keeps drafts from viewers: an editor sees
 * every row, and anyone else loses drafts while a note pending removal is still
 * the published note to them. Shared by the web schedule and the mobile API.
 */
export function scheduleNotesForViewer<T extends { status: ScheduleNoteStatus }>(
  rows: readonly T[],
  canSeeDrafts: boolean,
): T[] {
  if (canSeeDrafts) return [...rows];
  return rows
    .filter((row) => row.status !== "draft")
    .map((row) => (row.status === "draft_deleted" ? { ...row, status: "published" } : row));
}
