import { queryOptions } from "@tanstack/react-query";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { queryKeys } from "@/lib/query-keys";

/** The billing summary the header reads; shared with the sign-in prefetch. */
export function organizationBillingQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.org.billing(orgId),
    queryFn: () => fetchOrganizationBilling(orgId),
    staleTime: 30_000,
  });
}
