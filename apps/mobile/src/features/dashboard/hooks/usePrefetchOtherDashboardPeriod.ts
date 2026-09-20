import { useEffect } from "react";
import { getDashboard, getMySchedule } from "../../../shared/lib/api";
import { getDashboardPeriodRange, type DashboardPeriodMode } from "../../../shared/lib/dates";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { queryClient } from "../../../shared/lib/query-client";
import { getAdminDashboardQueryKey } from "./useAdminDashboard";

/**
 * Warms the period the toggle is not on, so switching shows it from cache
 * with no scrim. Both periods load together from the first paint, so even an
 * immediate switch finds the other one in flight or landed, and it runs again
 * each time the current period refreshes, so a pull or a realtime nudge keeps
 * both periods equally fresh. `prefetchQuery` is a no-op while the other
 * period is still fresh, so this costs one request per refresh, not one per
 * render.
 */
export function usePrefetchOtherDashboardPeriod(input: {
  accessToken: string | null;
  periodMode: DashboardPeriodMode;
  payPeriodStartDate: string | null;
  /** False for management-only users, who never see Your schedule. */
  includeSchedule: boolean;
  /** Bootstrap has landed: the two-week range depends on its pay-period anchor. */
  ready: boolean;
  /** The current period's `dataUpdatedAt`: a new value re-warms the other. */
  currentUpdatedAt: number;
}) {
  const { accessToken, periodMode, payPeriodStartDate, includeSchedule, ready, currentUpdatedAt } =
    input;

  useEffect(() => {
    if (!accessToken || !ready) return;
    const otherMode: DashboardPeriodMode = periodMode === "week" ? "2weeks" : "week";
    const otherRange = getDashboardPeriodRange(otherMode, new Date(), payPeriodStartDate);

    void queryClient.prefetchQuery({
      queryKey: getAdminDashboardQueryKey(accessToken, otherRange),
      queryFn: ({ signal }) => getDashboard(accessToken, otherRange, signal),
    });
    if (includeSchedule) {
      void queryClient.prefetchQuery({
        queryKey: mobileQueryKeys.dashboardSchedule(accessToken, otherRange),
        queryFn: ({ signal }) => getMySchedule(accessToken, otherRange, signal),
      });
    }
  }, [accessToken, currentUpdatedAt, includeSchedule, payPeriodStartDate, periodMode, ready]);
}
