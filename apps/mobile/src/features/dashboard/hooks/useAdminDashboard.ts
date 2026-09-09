import { useQuery } from "@tanstack/react-query";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { getDashboard } from "../../../shared/lib/api";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";

export function getAdminDashboardQueryKey(accessToken: string | null, range?: MobileScheduleRange) {
  return mobileQueryKeys.dashboard(accessToken, range);
}

export function useAdminDashboard(accessToken: string | null, range?: MobileScheduleRange) {
  return useQuery({
    queryKey: getAdminDashboardQueryKey(accessToken, range),
    queryFn: ({ signal }) => getDashboard(accessToken!, range, signal),
    enabled: Boolean(accessToken),
    // The range is part of the key, so changing the period would otherwise drop
    // back to `isLoading` and flash a skeleton over numbers that were already on
    // screen. Keep showing the old period until the new one lands.
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
}
