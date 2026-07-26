import { useQuery } from "@tanstack/react-query";
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
  });
}
