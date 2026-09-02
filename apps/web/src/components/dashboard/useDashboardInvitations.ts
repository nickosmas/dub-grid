import { useQuery } from "@tanstack/react-query";

import { fetchOrganizationInvitations } from "@/features/organization/client";
import { queryKeys } from "@/lib/query-keys";
import type { Invitation } from "@/types";

export function useDashboardInvitations(orgId: string, enabled: boolean): Invitation[] {
  const query = useQuery<Invitation[]>({
    queryKey: queryKeys.org.invitations(orgId),
    queryFn: () => fetchOrganizationInvitations(orgId),
    enabled,
  });

  return enabled ? (query.data ?? []) : [];
}
