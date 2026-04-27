import {
  cloneScheduleCellEntry,
  cloneScheduleCellSnapshot,
} from "@/lib/schedule-cells";
import type { ShiftMap } from "@/types";

export type DraftNoteState = {
  indicatorTypeId: number;
  status: "published" | "draft" | "draft_deleted";
};

export type EditSessionDraft = {
  cellKey: string;
  baseShift: ShiftMap[string] | null;
  draftShift: ShiftMap[string] | null;
  baseNotes: Record<number, DraftNoteState[]>;
  draftNotes: Record<number, DraftNoteState[]>;
  baseVersion?: number;
  baseFingerprint: string;
  isDirty: boolean;
  isStale: boolean;
};

export function cloneShiftEntry(
  shift: ShiftMap[string] | null | undefined,
): ShiftMap[string] | null {
  return cloneScheduleCellEntry(shift);
}

export function cloneDraftNotes(
  notes: DraftNoteState[] | undefined,
): DraftNoteState[] {
  return (notes ?? []).map((note) => ({ ...note }));
}

export function serializeShiftSnapshot(shift: ShiftMap[string] | null): string {
  if (!shift) return "null";
  return JSON.stringify({
    draft: cloneScheduleCellSnapshot(shift.draft),
    published: cloneScheduleCellSnapshot(shift.published),
    effective: cloneScheduleCellSnapshot(shift.effective),
    label: shift.label,
    segments: shift.segments ?? [],
    assignmentIds: shift.assignmentIds,
    isDelete: shift.isDelete ?? false,
    draftKind: shift.draftKind,
    publishedSegments: shift.publishedSegments ?? [],
    publishedAssignmentDefinitionIds: shift.publishedAssignmentDefinitionIds,
    publishedLabel: shift.publishedLabel,
    customStartTime: shift.customStartTime ?? null,
    customEndTime: shift.customEndTime ?? null,
    publishedCustomStartTime: shift.publishedCustomStartTime ?? null,
    publishedCustomEndTime: shift.publishedCustomEndTime ?? null,
    absenceTypeId: shift.absenceTypeId ?? null,
    publishedAbsenceTypeId: shift.publishedAbsenceTypeId ?? null,
    version: shift.version,
    seriesId: shift.seriesId ?? null,
  });
}

export function serializeNotesSnapshot(
  notesByFocusArea: Record<number, DraftNoteState[]>,
): string {
  const normalized = Object.entries(notesByFocusArea)
    .map(
      ([focusAreaId, notes]) =>
        [
          Number(focusAreaId),
          cloneDraftNotes(notes).sort(
            (firstNote, secondNote) =>
              firstNote.indicatorTypeId - secondNote.indicatorTypeId,
          ),
        ] as [number, DraftNoteState[]],
    )
    .sort((firstEntry, secondEntry) => firstEntry[0] - secondEntry[0]);

  return JSON.stringify(normalized);
}
