import type { ShiftMap, NoteType } from '@/types';

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
  notes: Record<string, { type: NoteType; status: 'published' | 'draft' | 'draft_deleted' }[]>,
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
