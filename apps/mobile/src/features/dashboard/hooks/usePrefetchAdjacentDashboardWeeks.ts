import { useEffect } from "react";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { addDaysToIsoDate } from "@dubgrid/schedule-core";
import { getDashboard, getMySchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { queryClient } from "../../../shared/lib/query-client";
import { getAdminDashboardQueryKey } from "./useAdminDashboard";

function shiftWeek(range: MobileScheduleRange, days: number): MobileScheduleRange {
  return {
    startDate: addDaysToIsoDate(range.startDate, days),
    endDate: addDaysToIsoDate(range.endDate, days),
  };
}

/**
 * Warms the weeks either side of the one shown, so the header's week stepper
 * lands on them from cache with no scrim. It runs again each time the shown
 * week refreshes, so a pull or a realtime nudge keeps its neighbours as fresh;
 * `prefetchQuery` is a no-op while a neighbour is still fresh.
 */
export function usePrefetchAdjacentDashboardWeeks(input: {
  accessToken: string | null;
  range: MobileScheduleRange;
  /** False for management-only users, who have no schedule of their own. */
  includeSchedule: boolean;
  /** Bootstrap has landed: "today", and so the shown week, depends on it. */
  ready: boolean;
  /** The shown week's `dataUpdatedAt`: a new value re-warms its neighbours. */
  currentUpdatedAt: number;
}) {
  const { accessToken, range, includeSchedule, ready, currentUpdatedAt } = input;
  const { startDate, endDate } = range;

  useEffect(() => {
    if (!accessToken || !ready) return;
    for (const week of [-7, 7].map((days) => shiftWeek({ startDate, endDate }, days))) {
      void queryClient.prefetchQuery({
        queryKey: getAdminDashboardQueryKey(accessToken, week),
        queryFn: ({ signal }) => getDashboard(accessToken, week, signal),
      });
      if (includeSchedule) {
        void queryClient.prefetchQuery({
          queryKey: mobileQueryKeys.dashboardSchedule(accessToken, week),
          queryFn: ({ signal }) => getMySchedule(accessToken, week, signal),
        });
      }
    }
  }, [accessToken, currentUpdatedAt, endDate, includeSchedule, ready, startDate]);
}
