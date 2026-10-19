import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchOrganizationInvitations } from "@/features/organization/client";
import { queryKeys } from "@/lib/query-keys";
import type { Invitation } from "@/types";

/** Shared with the sign-in prefetch so both read one cache entry. */
export function dashboardInvitationsQueryOptions(orgId: string) {
  return queryOptions<Invitation[]>({
    queryKey: queryKeys.org.invitations(orgId),
    queryFn: () => fetchOrganizationInvitations(orgId),
  });
}

export function useDashboardInvitations(orgId: string, enabled: boolean): Invitation[] {
  const query = useQuery({ ...dashboardInvitationsQueryOptions(orgId), enabled });

  return enabled ? (query.data ?? []) : [];
}
