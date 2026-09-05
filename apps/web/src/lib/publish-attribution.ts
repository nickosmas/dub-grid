import type { ShiftMap } from "@/types";
import {
  extractDateKeyFromCellKey,
  type DateRangeFilter,
  type DraftBreakdown,
} from "@/lib/draft-utils";

type NoteMap = Record<
  string,
  {
    indicatorTypeId: number;
    status: "published" | "draft" | "draft_deleted";
    updatedBy: string | null;
  }[]
>;

/** Bucket for changes whose author is unknown, kept visible rather than dropped. */
export const UNATTRIBUTED_EDITOR_ID = "__unattributed__";

export interface EditorDraftBreakdown extends DraftBreakdown {
  /** Author's user id, or `UNATTRIBUTED_EDITOR_ID` when the change has none. */
  editorId: string;
  isCurrentUser: boolean;
}

function emptyBreakdown(editorId: string, isCurrentUser: boolean): EditorDraftBreakdown {
  return {
    editorId,
    isCurrentUser,
    newShifts: 0,
    modifiedShifts: 0,
    deletedShifts: 0,
    newNotes: 0,
    deletedNotes: 0,
    totalChanges: 0,
  };
}

function inRange(key: string, range?: DateRangeFilter): boolean {
  if (!range) return true;
  const dateKey = extractDateKeyFromCellKey(key);
  if (!dateKey) return false;
  return dateKey >= range.startDateKey && dateKey <= range.endDateKey;
}

/**
 * Splits the unpublished changes in a publish window by who made them.
 *
 * Publishing commits the whole window, other editors' drafts included, so the
 * confirmation has to be able to say whose work is about to go live. Totals here
 * are deliberately the same arithmetic as `computeDraftBreakdown` over the same
 * window, so the per-editor rows always add up to the headline count.
 *
 * Changes with no recorded author are grouped under `UNATTRIBUTED_EDITOR_ID`
 * rather than discarded: dropping them would make the rows disagree with the
 * total, which is worse than admitting the author is unknown.
 */
export function computeEditorDraftBreakdowns(
  shifts: ShiftMap,
  notes: NoteMap,
  currentUserId: string | null,
  range?: DateRangeFilter,
): EditorDraftBreakdown[] {
  const byEditor = new Map<string, EditorDraftBreakdown>();

  const bucketFor = (authorId: string | null | undefined): EditorDraftBreakdown => {
    const editorId = authorId ?? UNATTRIBUTED_EDITOR_ID;
    let bucket = byEditor.get(editorId);
    if (!bucket) {
      bucket = emptyBreakdown(editorId, currentUserId != null && editorId === currentUserId);
      byEditor.set(editorId, bucket);
    }
    return bucket;
  };

  for (const [key, entry] of Object.entries(shifts)) {
    if (entry?.draftKind == null) continue;
    if (!inRange(key, range)) continue;

    const bucket = bucketFor(entry.updatedBy);
    switch (entry.draftKind) {
      case "new":
        bucket.newShifts += 1;
        break;
      case "modified":
        bucket.modifiedShifts += 1;
        break;
      case "deleted":
        bucket.deletedShifts += 1;
        break;
      default:
        continue;
    }
    bucket.totalChanges += 1;
  }

  for (const [key, noteList] of Object.entries(notes)) {
    if (!inRange(key, range)) continue;
    for (const note of noteList) {
      if (note.status !== "draft" && note.status !== "draft_deleted") continue;
      const bucket = bucketFor(note.updatedBy);
      if (note.status === "draft") bucket.newNotes += 1;
      else bucket.deletedNotes += 1;
      bucket.totalChanges += 1;
    }
  }

  // Current user first, then the busiest editors, with unknown authorship last
  // so it never displaces a named person.
  return Array.from(byEditor.values()).sort((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
    const aUnknown = a.editorId === UNATTRIBUTED_EDITOR_ID;
    const bUnknown = b.editorId === UNATTRIBUTED_EDITOR_ID;
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    if (a.totalChanges !== b.totalChanges) return b.totalChanges - a.totalChanges;
    return a.editorId.localeCompare(b.editorId);
  });
}

/** Compact per-editor summary, e.g. "2 new, 1 edited shift, 1 new note". */
export function formatEditorBreakdownSummary(breakdown: EditorDraftBreakdown): string {
  const parts: string[] = [];
  if (breakdown.newShifts > 0) parts.push(`${breakdown.newShifts} new`);
  if (breakdown.modifiedShifts > 0) parts.push(`${breakdown.modifiedShifts} edited`);
  if (breakdown.deletedShifts > 0) parts.push(`${breakdown.deletedShifts} deleted`);

  const shiftCount = breakdown.newShifts + breakdown.modifiedShifts + breakdown.deletedShifts;
  const summary = parts.length > 0 ? `${parts.join(", ")} shift${shiftCount === 1 ? "" : "s"}` : "";

  const noteParts: string[] = [];
  if (breakdown.newNotes > 0) {
    noteParts.push(`${breakdown.newNotes} new note${breakdown.newNotes === 1 ? "" : "s"}`);
  }
  if (breakdown.deletedNotes > 0) {
    noteParts.push(
      `${breakdown.deletedNotes} removed note${breakdown.deletedNotes === 1 ? "" : "s"}`,
    );
  }

  return [summary, ...noteParts].filter(Boolean).join(", ") || "No unpublished changes";
}
