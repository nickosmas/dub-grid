import type { ShiftMap } from '@/types';

export interface DraftBreakdown {
  newShifts: number;
  modifiedShifts: number;
  deletedShifts: number;
  newNotes: number;
  deletedNotes: number;
  totalChanges: number;
}

export function computeDraftBreakdown(
  shifts: ShiftMap,
  notes: Record<string, { indicatorTypeId: number; status: 'published' | 'draft' | 'draft_deleted' }[]>,
): DraftBreakdown {
  let newShifts = 0;
  let modifiedShifts = 0;
  let deletedShifts = 0;
  let newNotes = 0;
  let deletedNotes = 0;

  for (const entry of Object.values(shifts)) {
    switch (entry.draftKind) {
      case 'new': newShifts++; break;
      case 'modified': modifiedShifts++; break;
      case 'deleted': deletedShifts++; break;
    }
  }

  for (const noteList of Object.values(notes)) {
    for (const note of noteList) {
      if (note.status === 'draft') newNotes++;
      if (note.status === 'draft_deleted') deletedNotes++;
    }
  }

  return {
    newShifts,
    modifiedShifts,
    deletedShifts,
    newNotes,
    deletedNotes,
    totalChanges: newShifts + modifiedShifts + deletedShifts + newNotes + deletedNotes,
  };
}

export function draftBreakdownsEqual(
  left: DraftBreakdown,
  right: DraftBreakdown,
): boolean {
  return (
    left.newShifts === right.newShifts
    && left.modifiedShifts === right.modifiedShifts
    && left.deletedShifts === right.deletedShifts
    && left.newNotes === right.newNotes
    && left.deletedNotes === right.deletedNotes
    && left.totalChanges === right.totalChanges
  );
}

export function formatDraftBreakdownSummary(
  breakdown: DraftBreakdown,
): string {
  const parts: string[] = [];

  if (breakdown.newShifts > 0) {
    parts.push(`${breakdown.newShifts} new shift${breakdown.newShifts === 1 ? "" : "s"}`);
  }
  if (breakdown.modifiedShifts > 0) {
    parts.push(`${breakdown.modifiedShifts} edited shift${breakdown.modifiedShifts === 1 ? "" : "s"}`);
  }
  if (breakdown.deletedShifts > 0) {
    parts.push(`${breakdown.deletedShifts} deleted shift${breakdown.deletedShifts === 1 ? "" : "s"}`);
  }
  if (breakdown.newNotes > 0) {
    parts.push(`${breakdown.newNotes} new note${breakdown.newNotes === 1 ? "" : "s"}`);
  }
  if (breakdown.deletedNotes > 0) {
    parts.push(`${breakdown.deletedNotes} removed note${breakdown.deletedNotes === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(", ") : "No unpublished changes";
}
