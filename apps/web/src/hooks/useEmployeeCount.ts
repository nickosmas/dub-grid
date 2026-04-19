import { useQuery } from "@tanstack/react-query";
import { fetchEmployeeCount } from "@/lib/db";
import { queryKeys } from "@/lib/query-keys";

export interface EmployeeCountData {
  employeeCount: number;
  loading: boolean;
}

export function useEmployeeCount(orgId: string | null): EmployeeCountData {
  const countQuery = useQuery({
    queryKey: orgId ? queryKeys.org.employeeCount(orgId) : ["org", "employeeCount", "disabled"],
    queryFn: () => fetchEmployeeCount(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return {
    employeeCount: countQuery.data ?? 0,
    loading: countQuery.isLoading,
  };
}
