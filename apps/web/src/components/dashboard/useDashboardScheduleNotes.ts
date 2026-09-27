import { useQuery } from "@tanstack/react-query";

import { fetchScheduleNotes } from "@/features/schedule/client";
import { queryKeys } from "@/lib/query-keys";
import type { ScheduleNote } from "@/types";

const NO_NOTES: ScheduleNote[] = [];

/**
 * The window's schedule notes, requested beside the dashboard's shifts rather
 * than after them. Keyed under the organization's shifts so the realtime
 * `schedule_notes` invalidation refreshes it. A failed request shows no notes
 * and leaves the schedule as it is.
 */
export function useDashboardScheduleNotes(
  orgId: string,
  window: { start: string; end: string },
): ScheduleNote[] {
  const query = useQuery<ScheduleNote[]>({
    queryKey: [...queryKeys.shifts.all(orgId), "scheduleNotes", window.start, window.end],
    queryFn: () => fetchScheduleNotes(orgId, window.start, window.end),
  });

  return query.data ?? NO_NOTES;
}
