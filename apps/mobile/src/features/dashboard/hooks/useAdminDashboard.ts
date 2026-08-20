import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { getDashboard } from "../../../shared/lib/api";

export function getAdminDashboardQueryKey(accessToken: string | null, range?: MobileScheduleRange) {
  return ["mobile", "dashboard", accessToken, range?.startDate, range?.endDate] as const;
}

export function useAdminDashboard(accessToken: string | null, range?: MobileScheduleRange) {
  return useQuery({
    queryKey: getAdminDashboardQueryKey(accessToken, range),
    queryFn: () => getDashboard(accessToken!, range),
    enabled: Boolean(accessToken),
    // The range is part of the key, so changing the period would otherwise drop
    // back to `isLoading` and flash a skeleton over numbers that were already on
    // screen. Keep showing the old period until the new one lands.
    placeholderData: keepPreviousData,
  });
}
