import type { MobileBootstrapResponse } from "@dubgrid/contracts";
import { getIsoDateInTimeZone, getScheduleRangeForDate } from "@dubgrid/schedule-core";
import { getDashboard, getMySchedule, getShiftRequests } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { queryClient } from "../../../shared/lib/query-client";
import { getAdminDashboardQueryKey } from "../../dashboard/hooks/useAdminDashboard";
import { isManagementOnly } from "../hooks/employmentStatus";
import { isAdminHomeRole } from "../hooks/useTabsGate";

/**
 * Starts the Home tab's first queries the moment bootstrap names the role, so
 * they run beside the splash or the sign-in handoff instead of after the tab
 * tree mounts. The keys, functions and default ranges are the ones the Home
 * screens use, so the screen finds the request already in flight. Never
 * awaited: Home still loads on its own if any of these fail.
 */
export function prefetchHomeQueries(
  accessToken: string,
  bootstrap: MobileBootstrapResponse | undefined,
): void {
  if (!bootstrap) return;
  const linkedEmployee = bootstrap.linkedEmployee ?? null;
  const managementOnly = isManagementOnly(
    linkedEmployee?.focusAreaIds ?? [],
    linkedEmployee?.departmentIds ?? [],
  );

  // This week in the organization's time zone, as both homes open on it.
  const range = getScheduleRangeForDate(
    getIsoDateInTimeZone(new Date(), bootstrap.currentOrg.timezone),
  );

  if (isAdminHomeRole(bootstrap.effectiveRole)) {
    void queryClient.prefetchQuery({
      queryKey: getAdminDashboardQueryKey(accessToken, range),
      queryFn: ({ signal }) => getDashboard(accessToken, range, signal),
    });
    if (!managementOnly) {
      void queryClient.prefetchQuery({
        queryKey: mobileQueryKeys.dashboardSchedule(accessToken, range),
        queryFn: ({ signal }) => getMySchedule(accessToken, range, signal),
      });
      void queryClient.prefetchQuery({
        queryKey: mobileQueryKeys.shiftRequests(accessToken, range),
        queryFn: ({ signal }) => getShiftRequests(accessToken, range, signal),
      });
    }
    return;
  }

  // Home sends these users to the team schedule instead.
  if (bootstrap.effectiveRole === "user" && managementOnly) return;

  void queryClient.prefetchQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "mine", range),
    queryFn: ({ signal }) => getMySchedule(accessToken, range, signal),
  });
  void queryClient.prefetchQuery({
    queryKey: mobileQueryKeys.shiftRequests(accessToken, range),
    queryFn: ({ signal }) => getShiftRequests(accessToken, range, signal),
  });
}
