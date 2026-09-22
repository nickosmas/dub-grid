import type { ShiftMap } from "@/types";
import type { ScheduleNoteMap } from "./schedule-window";

export function mergeDraftChangedBroadcastPayload(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current, ...next };
  const currentShifts = (current.shifts as Record<string, unknown> | undefined) ?? {};
  const nextShifts = (next.shifts as Record<string, unknown> | undefined) ?? {};
  const currentNotes = (current.notes as Record<string, unknown> | undefined) ?? {};
  const nextNotes = (next.notes as Record<string, unknown> | undefined) ?? {};

  if (Object.keys(currentShifts).length || Object.keys(nextShifts).length) {
    merged.shifts = { ...currentShifts, ...nextShifts };
  }
  if (Object.keys(currentNotes).length || Object.keys(nextNotes).length) {
    merged.notes = { ...currentNotes, ...nextNotes };
  }

  return merged;
}

export interface DraftChangedPayload {
  senderSessionId?: unknown;
  shifts?: unknown;
  notes?: unknown;
}

export interface DraftChangedViewer {
  editorSessionId: string;
  canEditShifts: boolean;
}

export interface DraftChangedActions {
  /** Cells to upsert, or delete where the value is null. Absent when there is nothing to apply. */
  shifts?: Record<string, ShiftMap[string] | null>;
  notes?: ScheduleNoteMap;
  /** The sender said something changed without saying what, so ask the server. */
  refetch: boolean;
}

/**
 * What a `draft_changed` broadcast means for this viewer.
 *
 * A note editor without `canEditShifts` may join the draft topic (they need
 * the note half), but the read path redacts draft cells for them and the
 * snapshot policy refuses them those rows, so the shift half is dropped
 * rather than painted onto their grid. Dropping it is not a gap either: a
 * refetch would only return the published state they already hold.
 */
export function readDraftChangedBroadcast(
  payload: DraftChangedPayload | undefined,
  viewer: DraftChangedViewer,
): DraftChangedActions | null {
  if (!payload || payload.senderSessionId === viewer.editorSessionId) return null;

  const shifts =
    viewer.canEditShifts && payload.shifts
      ? (payload.shifts as Record<string, ShiftMap[string] | null>)
      : undefined;
  const notes = payload.notes ? (payload.notes as ScheduleNoteMap) : undefined;
  const carriedADiff = Boolean(payload.shifts || payload.notes);

  return { shifts, notes, refetch: !carriedADiff };
}
