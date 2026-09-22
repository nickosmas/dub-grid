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
  /** The cells this viewer already holds, so an older one can be recognized. */
  currentShifts?: ShiftMap;
}

export interface DraftChangedActions {
  /** Cells to upsert, or delete where the value is null. Absent when there is nothing to apply. */
  shifts?: Record<string, ShiftMap[string] | null>;
  notes?: ScheduleNoteMap;
  /** The sender said something changed without saying what, so ask the server. */
  refetch: boolean;
}

/**
 * Drops an incoming cell the receiver already has a newer copy of.
 *
 * Broadcasts arrive out of order, are re-sent from the pending queue after a
 * reconnect, and can be replayed by a peer that never learned its own write
 * failed, so "last message wins" could put an older version of a cell back on
 * the grid. A cell with no version (never persisted) and a deletion carry no
 * ordering of their own and are taken as sent; everything else must be newer
 * than what is held.
 */
function keepNewerCells(
  incoming: Record<string, ShiftMap[string] | null>,
  currentShifts: ShiftMap | undefined,
): Record<string, ShiftMap[string] | null> | undefined {
  if (!currentShifts) return incoming;

  const kept: Record<string, ShiftMap[string] | null> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const held = currentShifts[key];
    if (value && held && typeof value.version === "number" && typeof held.version === "number") {
      if (value.version <= held.version) continue;
    }
    kept[key] = value;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
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

  const offered =
    viewer.canEditShifts && payload.shifts
      ? (payload.shifts as Record<string, ShiftMap[string] | null>)
      : undefined;
  const shifts = offered ? keepNewerCells(offered, viewer.currentShifts) : undefined;
  const notes = payload.notes ? (payload.notes as ScheduleNoteMap) : undefined;
  const carriedADiff = Boolean(payload.shifts || payload.notes);

  return { shifts, notes, refetch: !carriedADiff };
}
