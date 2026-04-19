import { useQuery } from "@tanstack/react-query";
import { fetchOrgDirectory } from "@/lib/db";
import { queryKeys } from "@/lib/query-keys";
import type { DirectoryPerson } from "@/types";

export interface DirectoryData {
  directory: DirectoryPerson[];
  loading: boolean;
  error: string | null;
}

export function useDirectory(orgId: string | null): DirectoryData {
  const query = useQuery({
    queryKey: queryKeys.org.directory(orgId!),
    queryFn: () => fetchOrgDirectory(orgId!),
    enabled: !!orgId,
    staleTime: 2 * 60_000,
  });

  return {
    directory: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}
