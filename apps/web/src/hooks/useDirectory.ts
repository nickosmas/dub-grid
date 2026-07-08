import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOrganizationDirectory } from "@/features/organization/client";
import { queryKeys } from "@/lib/query-keys";
import type { DirectoryPerson } from "@/types";

export interface DirectoryData {
  directory: DirectoryPerson[];
  loading: boolean;
  error: string | null;
  /** True when the server capped the result and didn't return every member. */
  truncated: boolean;
  /** Cap that was applied (only set when truncated). */
  cap: number | null;
}

export function useDirectory(orgId: string | null): DirectoryData {
  // Truncation flag lives outside the React Query cache so the cache shape
  // stays a plain DirectoryPerson[] — several call sites read/setQueryData on
  // that key and expect an array.
  const [truncationInfo, setTruncationInfo] = useState<{
    truncated: boolean;
    cap: number | null;
  }>({ truncated: false, cap: null });

  const query = useQuery({
    queryKey: queryKeys.org.directory(orgId!),
    queryFn: async () => {
      const result = await fetchOrganizationDirectory(orgId!);
      setTruncationInfo({
        truncated: Boolean(result.truncated),
        cap: result.cap ?? null,
      });
      return result.directory;
    },
    enabled: !!orgId,
    staleTime: 2 * 60_000,
  });

  return {
    directory: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    truncated: truncationInfo.truncated,
    cap: truncationInfo.cap,
  };
}
