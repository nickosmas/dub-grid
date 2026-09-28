import { cloneScheduleCellEntry, cloneScheduleCellSnapshot } from "@/lib/schedule-cells";
import type { DraftKind, ScheduleNoteShift, ShiftJobSegment, ShiftMap } from "@/types";

/** A note in the editor: its type, and the shift it belongs to (both null when none). */
export type DraftNoteState = {
  indicatorTypeId: number;
  status: "published" | "draft" | "draft_deleted";
  shiftId: number | null;
  jobId: number | null;
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

/** Also fills in the shift for a note from a map entry that predates 063. */
export function cloneDraftNotes(
  notes:
    ReadonlyArray<Omit<DraftNoteState, "shiftId" | "jobId"> & Partial<DraftNoteState>> | undefined,
): DraftNoteState[] {
  return (notes ?? []).map((note) => ({
    indicatorTypeId: note.indicatorTypeId,
    status: note.status,
    shiftId: note.shiftId ?? null,
    jobId: note.jobId ?? null,
  }));
}

export function noteShiftOf(
  segment: { shiftId?: number | null; jobId?: number | null } | null | undefined,
): ScheduleNoteShift | null {
  return segment?.jobId != null ? { shiftId: segment.shiftId ?? null, jobId: segment.jobId } : null;
}

function isOnShift(note: DraftNoteState, shift: ScheduleNoteShift | null): boolean {
  if (!shift) return note.jobId == null;
  return note.jobId === shift.jobId && note.shiftId === shift.shiftId;
}

const isActiveNote = (note: DraftNoteState) => note.status !== "draft_deleted";

/** Identifies a note within one focus area of a cell. */
export function draftNoteKey(note: DraftNoteState): string {
  return `${note.indicatorTypeId}|${note.shiftId ?? "-"}|${note.jobId ?? "-"}`;
}

/**
 * The note types a shift shows: its own, plus any note no shift claims, which
 * belongs to every shift in its focus area. Without a shift, only the latter.
 */
export function activeNoteIds(
  notes: readonly DraftNoteState[],
  shift: ScheduleNoteShift | null,
): number[] {
  const ids = new Set<number>();
  for (const note of notes) {
    if (!isActiveNote(note)) continue;
    if (isOnShift(note, shift) || note.jobId == null) ids.add(note.indicatorTypeId);
  }
  return [...ids];
}

/**
 * Turns a note on or off for one shift. Turning one on writes it against that
 * shift, unless a note no shift claims already covers it or was only pending
 * removal. Turning one off removes the shift's own note first, and only then
 * one no shift claims, so undoing either restores what was there.
 */
export function toggleDraftNote(
  notes: readonly DraftNoteState[],
  indicatorTypeId: number,
  active: boolean,
  shift: ScheduleNoteShift | null,
): DraftNoteState[] {
  const ofType = (note: DraftNoteState) => note.indicatorTypeId === indicatorTypeId;
  const own = notes.find((note) => ofType(note) && isOnShift(note, shift));
  const unclaimed = shift ? notes.find((note) => ofType(note) && note.jobId == null) : undefined;
  const setStatus = (target: DraftNoteState, status: DraftNoteState["status"]) =>
    notes.map((note) => (note === target ? { ...note, status } : note));
  const without = (target: DraftNoteState) => notes.filter((note) => note !== target);

  if (active) {
    if (own?.status === "draft_deleted") return setStatus(own, "published");
    if (own) return [...notes];
    if (unclaimed?.status === "draft_deleted") return setStatus(unclaimed, "published");
    if (unclaimed) return [...notes];
    return [
      ...notes,
      {
        indicatorTypeId,
        status: "draft",
        shiftId: shift?.shiftId ?? null,
        jobId: shift?.jobId ?? null,
      },
    ];
  }

  const target =
    own && isActiveNote(own) ? own : unclaimed && isActiveNote(unclaimed) ? unclaimed : null;
  if (!target) return [...notes];
  return target.status === "published" ? setStatus(target, "draft_deleted") : without(target);
}

/**
 * Notes of the shifts a cell no longer has, removed the way the server
 * removes them when the cell is saved: a draft goes, a published note waits
 * for the publish. Notes no shift claims stay.
 */
export function dropNotesOfRemovedShifts(
  notes: readonly DraftNoteState[],
  keptShifts: ReadonlyArray<ScheduleNoteShift>,
): DraftNoteState[] {
  const kept = (note: DraftNoteState) =>
    note.jobId == null || keptShifts.some((shift) => isOnShift(note, shift));
  return notes
    .filter((note) => kept(note) || note.status !== "draft")
    .map((note) =>
      kept(note) || note.status !== "published" ? note : { ...note, status: "draft_deleted" },
    );
}

export interface PlannedNoteWrite {
  kind: "upsert" | "delete";
  focusAreaId: number;
  indicatorTypeId: number;
  shift: ScheduleNoteShift | null;
  baseStatus: DraftNoteState["status"] | undefined;
}

/**
 * The note writes that turn a cell's saved notes into the edited ones, and the
 * notes the cell holds afterwards. The result mirrors each endpoint's rule for
 * what a write leaves behind, so it matches what a refetch would return.
 */
export function planNoteWrites(
  baseNotes: Record<number, DraftNoteState[]>,
  draftNotes: Record<number, DraftNoteState[]>,
): { writes: PlannedNoteWrite[]; results: Map<number, DraftNoteState[]> } {
  const writes: PlannedNoteWrite[] = [];
  const results = new Map<number, DraftNoteState[]>();
  const focusAreaIds = new Set<number>([
    ...Object.keys(baseNotes).map(Number),
    ...Object.keys(draftNotes).map(Number),
  ]);

  for (const focusAreaId of focusAreaIds) {
    const base = new Map((baseNotes[focusAreaId] ?? []).map((note) => [draftNoteKey(note), note]));
    const draft = new Map(
      (draftNotes[focusAreaId] ?? []).map((note) => [draftNoteKey(note), note]),
    );
    const resulting = new Map(base);

    for (const key of new Set([...base.keys(), ...draft.keys()])) {
      const before = base.get(key);
      const after = draft.get(key);
      if (before?.status === after?.status) continue;
      const note = (after ?? before)!;
      const write = {
        focusAreaId,
        indicatorTypeId: note.indicatorTypeId,
        shift: noteShiftOf(note),
        baseStatus: before?.status,
      };

      if (after && after.status !== "draft_deleted") {
        // A save restores a note pending removal and otherwise adds a draft.
        resulting.set(key, {
          ...note,
          status: before?.status === "draft_deleted" ? "published" : "draft",
        });
        writes.push({ kind: "upsert", ...write });
      } else if (before) {
        // A delete removes a draft outright but only marks a published note.
        if (before.status === "draft") resulting.delete(key);
        else resulting.set(key, { ...before, status: "draft_deleted" });
        writes.push({ kind: "delete", ...write });
      }
    }

    results.set(focusAreaId, [...resulting.values()]);
  }

  return { writes, results };
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
          cloneDraftNotes(notes).sort((firstNote, secondNote) =>
            draftNoteKey(firstNote).localeCompare(draftNoteKey(secondNote)),
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
