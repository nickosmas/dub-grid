import { cloneScheduleCellEntry, cloneScheduleCellSnapshot } from "@/lib/schedule-cells";
import type { DraftKind, ShiftJobSegment, ShiftMap } from "@/types";

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

export function cloneDraftNotes(notes: DraftNoteState[] | undefined): DraftNoteState[] {
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

export function serializeNotesSnapshot(notesByFocusArea: Record<number, DraftNoteState[]>): string {
  const normalized = Object.entries(notesByFocusArea)
    .map(
      ([focusAreaId, notes]) =>
        [
          Number(focusAreaId),
          cloneDraftNotes(notes).sort(
            (firstNote, secondNote) => firstNote.indicatorTypeId - secondNote.indicatorTypeId,
          ),
        ] as [number, DraftNoteState[]],
    )
    .sort((firstEntry, secondEntry) => firstEntry[0] - secondEntry[0]);

  return JSON.stringify(normalized);
}

function shiftEntryHasWorkedContent(shift: ShiftMap[string] | null): boolean {
  return (shift?.assignmentIds.length ?? 0) > 0 || (shift?.segments?.length ?? 0) > 0;
}

function shiftEntryIsDeleted(shift: ShiftMap[string] | null): boolean {
  return (
    !shift ||
    shift.isDelete === true ||
    (!shiftEntryHasWorkedContent(shift) && shift.absenceTypeId == null)
  );
}

function segmentIdentity(
  segment: Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">,
  index: number,
) {
  return {
    shiftId: segment.shiftId ?? null,
    jobId: segment.jobId,
    position: segment.position ?? index,
    isMentored: segment.isMentored ?? false,
  };
}

function segmentIdentitiesMatch(
  left: ReadonlyArray<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>,
  right: ReadonlyArray<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>,
): boolean {
  if (left.length !== right.length) return false;

  return left.every((segment, index) => {
    const other = right[index];
    if (!other) return false;
    const normalizedSegment = segmentIdentity(segment, index);
    const normalizedOther = segmentIdentity(other, index);
    return (
      normalizedSegment.shiftId === normalizedOther.shiftId &&
      normalizedSegment.jobId === normalizedOther.jobId &&
      normalizedSegment.position === normalizedOther.position &&
      normalizedSegment.isMentored === normalizedOther.isMentored
    );
  });
}

function numberArraysMatch(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function shiftEditableIdentityMatches(
  left: ShiftMap[string] | null,
  right: ShiftMap[string] | null,
): boolean {
  const leftDeleted = shiftEntryIsDeleted(left);
  const rightDeleted = shiftEntryIsDeleted(right);
  if (leftDeleted || rightDeleted) return leftDeleted === rightDeleted;

  const leftSegments = left?.segments ?? [];
  const rightSegments = right?.segments ?? [];
  const segmentsMatch =
    leftSegments.length > 0 || rightSegments.length > 0
      ? segmentIdentitiesMatch(leftSegments, rightSegments)
      : numberArraysMatch(left?.assignmentIds ?? [], right?.assignmentIds ?? []);

  return segmentsMatch && (left?.absenceTypeId ?? null) === (right?.absenceTypeId ?? null);
}

export function computeScheduleEntryDraftKind(entry: ShiftMap[string]): DraftKind {
  const publishedAssignmentIds = entry.publishedAssignmentDefinitionIds ?? [];
  const publishedSegments = entry.publishedSegments ?? [];
  const hasPublishedContent =
    publishedAssignmentIds.length > 0 ||
    publishedSegments.length > 0 ||
    entry.publishedAbsenceTypeId != null;

  if (!hasPublishedContent) {
    return shiftEntryHasWorkedContent(entry) || entry.absenceTypeId != null ? "new" : null;
  }

  const hasSegmentIdentity = (entry.segments?.length ?? 0) > 0 || publishedSegments.length > 0;
  const assignmentsMatch = hasSegmentIdentity
    ? segmentIdentitiesMatch(entry.segments ?? [], publishedSegments)
    : numberArraysMatch(entry.assignmentIds, publishedAssignmentIds);
  const absMatch = (entry.absenceTypeId ?? null) === (entry.publishedAbsenceTypeId ?? null);
  const startMatch = (entry.customStartTime ?? null) === (entry.publishedCustomStartTime ?? null);
  const endMatch = (entry.customEndTime ?? null) === (entry.publishedCustomEndTime ?? null);

  if (assignmentsMatch && absMatch && startMatch && endMatch) return null;

  return !shiftEntryHasWorkedContent(entry) && entry.absenceTypeId == null ? "deleted" : "modified";
}
