import type { QueryClient } from "@tanstack/react-query";
import type { ShiftMap } from "@/types";
import type { ScheduleNoteMap } from "./schedule-window";

/**
 * A snapshot of the grid's loaded window, kept so returning to /schedule paints
 * from memory instead of refetching ±90 days of cells from scratch.
 *
 * Held under one key per org rather than keyed by date range on purpose: the
 * window accumulates as the user navigates, so a range-keyed entry would either
 * multiply per widen or lose what came before.
 */
export interface CachedScheduleWindow {
  window: { start: string; end: string };
  shifts: ShiftMap;
  notes: ScheduleNoteMap;
  /**
   * The edit permission the cells were fetched under. fetchShifts returns a
   * different shape for schedulers than for viewers, so serving a viewer's
   * snapshot to a scheduler (or the reverse) would paint the wrong grid.
   */
  canEditShifts: boolean;
}

export function scheduleWindowKey(orgId: string) {
  return ["schedule", "window", orgId] as const;
}

export function writeScheduleWindow(
  queryClient: QueryClient,
  orgId: string,
  value: CachedScheduleWindow,
): void {
  queryClient.setQueryData(scheduleWindowKey(orgId), value);
}

/**
 * Returns the snapshot only when it is safe to paint: same org, and fetched
 * under the same edit permission the caller has now. Anything else returns null
 * so the caller falls through to a normal fetch.
 */
export function readScheduleWindow(
  queryClient: QueryClient,
  orgId: string | null,
  canEditShifts: boolean,
): CachedScheduleWindow | null {
  if (!orgId) return null;
  const cached = queryClient.getQueryData<CachedScheduleWindow>(scheduleWindowKey(orgId));
  if (!cached) return null;
  if (cached.canEditShifts !== canEditShifts) return null;
  if (!cached.window?.start || !cached.window?.end) return null;
  return cached;
}
