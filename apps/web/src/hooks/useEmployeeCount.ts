import { useQuery } from "@tanstack/react-query";
import { fetchOrganizationEmployeeCount } from "@/features/organization/client";
import { queryKeys } from "@/lib/query-keys";

export interface EmployeeCountData {
  employeeCount: number;
  loading: boolean;
}

export function useEmployeeCount(orgId: string | null): EmployeeCountData {
  const countQuery = useQuery({
    queryKey: orgId ? queryKeys.org.employeeCount(orgId) : ["org", "employeeCount", "disabled"],
    queryFn: async () => (await fetchOrganizationEmployeeCount(orgId!)).employeeCount,
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return {
    employeeCount: countQuery.data ?? 0,
    loading: countQuery.isLoading,
  };
}
