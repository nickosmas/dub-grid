import { useEffect } from "react";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { addDaysToIsoDate } from "@dubgrid/schedule-core";
import { getDashboard, getMySchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { queryClient } from "../../../shared/lib/query-client";
import { getAdminDashboardQueryKey } from "./useAdminDashboard";

/**
 * How long after the shown week lands before its neighbours are fetched.
 * Fetching them alongside it tripled Home's first load on the server, which
 * is what the person is waiting on (2026-11-13).
 */
export const ADJACENT_WEEKS_PREFETCH_DELAY_MS = 1_500;

function shiftWeek(range: MobileScheduleRange, days: number): MobileScheduleRange {
  return {
    startDate: addDaysToIsoDate(range.startDate, days),
    endDate: addDaysToIsoDate(range.endDate, days),
  };
}

/**
 * Warms the weeks either side of the one shown, so the header's week stepper
 * usually lands on them from cache with no scrim. It waits for the shown week
 * and runs once per week shown: a pull or a realtime nudge refreshes only
 * the week on screen, and a neighbour that went stale is fetched when stepped to.
 */
export function usePrefetchAdjacentDashboardWeeks(input: {
  accessToken: string | null;
  range: MobileScheduleRange;
  /** False for management-only users, who have no schedule of their own. */
  includeSchedule: boolean;
  /** Bootstrap has landed: "today", and so the shown week, depends on it. */
  ready: boolean;
  /** The shown week has data. */
  currentLoaded: boolean;
}) {
  const { accessToken, range, includeSchedule, ready, currentLoaded } = input;
  const { startDate, endDate } = range;

  useEffect(() => {
    if (!accessToken || !ready || !currentLoaded) return;
    const timer = setTimeout(() => {
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
    }, ADJACENT_WEEKS_PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [accessToken, currentLoaded, endDate, includeSchedule, ready, startDate]);
}
