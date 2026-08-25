import type { ShiftMap } from "@/types";

export interface RealtimeDraftNote {
  indicatorTypeId: number;
  status: "published" | "draft" | "draft_deleted";
}

export type RealtimeDraftNotesMap = Record<string, RealtimeDraftNote[]>;

function normalizeShiftEntry(entry: ShiftMap[string] | null) {
  if (!entry) return null;

  return {
    label: entry.label,
    assignmentIds: [...entry.assignmentIds],
    isDraft: entry.isDraft,
    isDelete: entry.isDelete ?? false,
    draftKind: entry.draftKind,
    publishedAssignmentDefinitionIds: [...entry.publishedAssignmentDefinitionIds],
    publishedLabel: entry.publishedLabel,
    seriesId: entry.seriesId ?? null,
    fromRecurring: entry.fromRecurring ?? false,
    customStartTime: entry.customStartTime ?? null,
    customEndTime: entry.customEndTime ?? null,
    publishedCustomStartTime: entry.publishedCustomStartTime ?? null,
    publishedCustomEndTime: entry.publishedCustomEndTime ?? null,
    absenceTypeId: entry.absenceTypeId ?? null,
    publishedAbsenceTypeId: entry.publishedAbsenceTypeId ?? null,
    version: entry.version,
    createdBy: entry.createdBy ?? null,
    updatedBy: entry.updatedBy ?? null,
    createdAt: entry.createdAt ?? null,
    updatedAt: entry.updatedAt ?? null,
  };
}

function normalizeNoteList(notes: RealtimeDraftNote[] | undefined) {
  return [...(notes ?? [])].sort((left, right) => {
    if (left.indicatorTypeId !== right.indicatorTypeId) {
      return left.indicatorTypeId - right.indicatorTypeId;
    }
    return left.status.localeCompare(right.status);
  });
}

/**
 * Limits the diff to keys the caller already knows changed.
 *
 * Without it every call compares the entire loaded window — two
 * `JSON.stringify` calls per cell, on the main thread. That is unavoidable
 * after a publish or a discard, which can touch anything, but a single-cell
 * edit knows exactly what it wrote and shouldn't pay for the whole grid.
 */
export interface RealtimeDraftDiffScope {
  shiftKeys?: Iterable<string>;
  noteKeys?: Iterable<string>;
}

export function buildRealtimeDraftDiff(
  previousShifts: ShiftMap,
  nextShifts: ShiftMap,
  previousNotes: RealtimeDraftNotesMap,
  nextNotes: RealtimeDraftNotesMap,
  scope?: RealtimeDraftDiffScope,
): {
  shifts?: Record<string, ShiftMap[string] | null>;
  notes?: RealtimeDraftNotesMap;
} | null {
  const shiftUpdates: Record<string, ShiftMap[string] | null> = {};
  const noteUpdates: RealtimeDraftNotesMap = {};

  const shiftKeys = scope?.shiftKeys
    ? new Set(scope.shiftKeys)
    : new Set([...Object.keys(previousShifts), ...Object.keys(nextShifts)]);
  for (const key of shiftKeys) {
    const previous = previousShifts[key] ?? null;
    const next = nextShifts[key] ?? null;
    if (
      JSON.stringify(normalizeShiftEntry(previous)) !== JSON.stringify(normalizeShiftEntry(next))
    ) {
      shiftUpdates[key] = next;
    }
  }

  const noteKeys = scope?.noteKeys
    ? new Set(scope.noteKeys)
    : new Set([...Object.keys(previousNotes), ...Object.keys(nextNotes)]);
  for (const key of noteKeys) {
    const previous = normalizeNoteList(previousNotes[key]);
    const next = normalizeNoteList(nextNotes[key]);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      noteUpdates[key] = next;
    }
  }

  if (Object.keys(shiftUpdates).length === 0 && Object.keys(noteUpdates).length === 0) {
    return null;
  }

  return {
    ...(Object.keys(shiftUpdates).length > 0 ? { shifts: shiftUpdates } : {}),
    ...(Object.keys(noteUpdates).length > 0 ? { notes: noteUpdates } : {}),
  };
}
