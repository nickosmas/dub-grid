import { useQuery } from "@tanstack/react-query";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { getMySchedule } from "../../../shared/lib/api";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";

/**
 * The signed-in user's own shifts for the dashboard's period, read by the
 * admin Home's You group. The range follows the period toggle, so Week shows
 * one week and 2 Weeks shows two; without one the API answers with its own
 * forward-looking window.
 *
 * The `["mobile", "dashboard", ...]` prefix is load-bearing: manual
 * pull-to-refresh, realtime invalidation and the other period's prefetch all
 * target that prefix.
 */
export function useMyScheduleQuery(
  accessToken: string | null,
  options?: { enabled?: boolean; range?: MobileScheduleRange },
) {
  const range = options?.range;
  return useQuery({
    queryKey: mobileQueryKeys.dashboardSchedule(accessToken, range),
    queryFn: ({ signal }) => getMySchedule(accessToken!, range, signal),
    enabled: Boolean(accessToken) && (options?.enabled ?? true),
    // The range is part of the key, so a period change would otherwise drop
    // the card to nothing until the new week lands. Keep the old one dimmed.
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
}
