import type { DraftKind, ShiftMap } from '@/types';

export interface DraftBreakdown {
  newShifts: number;
  modifiedShifts: number;
  deletedShifts: number;
  newNotes: number;
  deletedNotes: number;
  totalChanges: number;
}

export interface PersistedDraftShift {
  draft_shift_code_ids?: number[] | null;
  published_shift_code_ids?: number[] | null;
  draft_absence_type_id?: number | null;
  published_absence_type_id?: number | null;
  draft_is_delete?: boolean | null;
  draft_custom_start_time?: string | null;
  draft_custom_end_time?: string | null;
  published_custom_start_time?: string | null;
  published_custom_end_time?: string | null;
}

export function hasPublishedShiftContent(shift: PersistedDraftShift): boolean {
  const publishedIds = shift.published_shift_code_ids ?? [];

  return (
    publishedIds.length > 0
    || (shift.published_absence_type_id ?? null) != null
    || (shift.published_custom_start_time ?? null) != null
    || (shift.published_custom_end_time ?? null) != null
  );
}

export function hasPersistedDraftChange(shift: PersistedDraftShift): boolean {
  const draftIds = shift.draft_shift_code_ids ?? [];
  const publishedIds = shift.published_shift_code_ids ?? [];
  const draftAbsenceTypeId = shift.draft_absence_type_id ?? null;
  const publishedAbsenceTypeId = shift.published_absence_type_id ?? null;
  const draftCustomStartTime = shift.draft_custom_start_time ?? null;
  const draftCustomEndTime = shift.draft_custom_end_time ?? null;
  const publishedCustomStartTime = shift.published_custom_start_time ?? null;
  const publishedCustomEndTime = shift.published_custom_end_time ?? null;

  if (shift.draft_is_delete) {
    return (
      hasPublishedShiftContent(shift)
      || draftIds.length > 0
      || draftAbsenceTypeId != null
      || draftCustomStartTime != null
      || draftCustomEndTime != null
    );
  }

  return (
    (draftIds.length > 0
      && (draftIds.length !== publishedIds.length
        || draftIds.some((id, index) => id !== publishedIds[index])))
    || (draftAbsenceTypeId != null
      && draftAbsenceTypeId !== publishedAbsenceTypeId)
    || (draftAbsenceTypeId == null
      && publishedAbsenceTypeId != null
      && draftIds.length > 0)
    || (draftCustomStartTime != null
      && draftCustomStartTime !== publishedCustomStartTime)
    || (draftCustomEndTime != null
      && draftCustomEndTime !== publishedCustomEndTime)
  );
}

export function classifyPersistedDraftShift(
  shift: PersistedDraftShift,
): DraftKind {
  if (!hasPersistedDraftChange(shift)) return null;
  if (shift.draft_is_delete && hasPublishedShiftContent(shift)) return 'deleted';
  if (!hasPublishedShiftContent(shift)) return 'new';
  return 'modified';
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
