import { cloneScheduleCellEntry, cloneScheduleCellSnapshot } from "@/lib/schedule-cells";
import type { DraftKind, ScheduleNoteShift, ShiftJobSegment, ShiftMap } from "@/types";

/** A note in the editor: its type, and the shift it belongs to. */
export type DraftNoteState = {
  indicatorTypeId: number;
  status: "published" | "draft" | "draft_deleted";
  shiftId: number | null;
  jobId: number;
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

/** A note always names its shift (065); an entry without one is dropped. */
export function cloneDraftNotes(
  notes:
    | ReadonlyArray<
        Pick<DraftNoteState, "indicatorTypeId" | "status"> & {
          shiftId?: number | null;
          jobId?: number | null;
        }
      >
    | undefined,
): DraftNoteState[] {
  return (notes ?? []).flatMap((note) =>
    note.jobId == null
      ? []
      : [
          {
            indicatorTypeId: note.indicatorTypeId,
            status: note.status,
            shiftId: note.shiftId ?? null,
            jobId: note.jobId,
          },
        ],
  );
}

export function noteShiftOf(
  segment: { shiftId?: number | null; jobId?: number | null } | null | undefined,
): ScheduleNoteShift | null {
  return segment?.jobId != null ? { shiftId: segment.shiftId ?? null, jobId: segment.jobId } : null;
}

function isOnShift(note: DraftNoteState, shift: ScheduleNoteShift): boolean {
  return note.jobId === shift.jobId && note.shiftId === shift.shiftId;
}

const isActiveNote = (note: DraftNoteState) => note.status !== "draft_deleted";

/** Identifies a note within one focus area of a cell. */
export function draftNoteKey(note: DraftNoteState): string {
  return `${note.indicatorTypeId}|${note.shiftId ?? "-"}|${note.jobId}`;
}

/** The note types a shift shows. */
export function activeNoteIds(
  notes: readonly DraftNoteState[],
  shift: ScheduleNoteShift,
): number[] {
  const ids = new Set<number>();
  for (const note of notes) {
    if (isActiveNote(note) && isOnShift(note, shift)) ids.add(note.indicatorTypeId);
  }
  return [...ids];
}

/**
 * Turns a note on or off for one shift. Turning on a note only pending removal
 * restores it; turning off a published note marks it for removal, so undoing
 * either restores what was there.
 */
export function toggleDraftNote(
  notes: readonly DraftNoteState[],
  indicatorTypeId: number,
  active: boolean,
  shift: ScheduleNoteShift,
): DraftNoteState[] {
  const own = notes.find(
    (note) => note.indicatorTypeId === indicatorTypeId && isOnShift(note, shift),
  );
  const setStatus = (status: DraftNoteState["status"]) =>
    notes.map((note) => (note === own ? { ...note, status } : note));

  if (active) {
    if (own?.status === "draft_deleted") return setStatus("published");
    if (own) return [...notes];
    return [...notes, { indicatorTypeId, status: "draft", ...shift }];
  }

  if (!own || !isActiveNote(own)) return [...notes];
  return own.status === "published"
    ? setStatus("draft_deleted")
    : notes.filter((note) => note !== own);
}

/**
 * Notes of the shifts a cell no longer has, removed the way the server
 * removes them when the cell is saved: a draft goes, a published note waits
 * for the publish.
 */
export function dropNotesOfRemovedShifts(
  notes: readonly DraftNoteState[],
  keptShifts: ReadonlyArray<ScheduleNoteShift>,
): DraftNoteState[] {
  const kept = (note: DraftNoteState) => keptShifts.some((shift) => isOnShift(note, shift));
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
  shift: ScheduleNoteShift;
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
        shift: { shiftId: note.shiftId, jobId: note.jobId },
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
