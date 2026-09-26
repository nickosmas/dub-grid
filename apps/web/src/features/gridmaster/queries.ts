import { queryOptions } from "@tanstack/react-query";
import { fetchGridmasterDashboardData } from "@/features/gridmaster/client";
import { queryKeys } from "@/lib/query-keys";

/** The portal's organizations and stats; shared with the sign-in prefetch. */
export function gridmasterDashboardQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.gridmaster.dashboard(),
    queryFn: fetchGridmasterDashboardData,
    staleTime: 30_000,
  });
}
