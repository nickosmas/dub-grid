import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOrganizationDirectory } from "@/features/organization/client";
import { queryKeys } from "@/lib/query-keys";
import type { DirectoryPerson } from "@/types";

const PAGE_SIZE = 50;

export interface DirectoryData {
  directory: DirectoryPerson[];
  loading: boolean;
  error: string | null;
  /** True when more rows exist beyond what's currently loaded. */
  hasMore: boolean;
  /** True while a loadMore() page fetch is in flight. */
  loadingMore: boolean;
  /** Fetch and append the next page of rows. No-op if already loading or exhausted. */
  loadMore: () => void;
}

export function useDirectory(orgId: string | null): DirectoryData {
  const queryClient = useQueryClient();
  // hasMore/loadingMore live outside the React Query cache so the cache shape
  // stays a plain DirectoryPerson[] — several call sites read/setQueryData on
  // that key and expect an array, including many optimistic updates in
  // MembersSection.tsx.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.org.directory(orgId!),
    queryFn: async () => {
      const result = await fetchOrganizationDirectory(orgId!, { limit: PAGE_SIZE, offset: 0 });
      setHasMore(result.hasMore);
      return result.directory;
    },
    enabled: !!orgId,
    staleTime: 2 * 60_000,
  });

  // Note: a realtime-triggered invalidation (useOrgRealtimeInvalidation) or a
  // background refetch re-runs queryFn from offset 0, which resets the list
  // back to the first page — same tradeoff AlertsInboxPage's manual-cursor
  // pagination makes. Acceptable: it's a resync to fresh data, not data loss.
  const loadMore = useCallback(() => {
    if (!orgId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const currentLength = (
          queryClient.getQueryData<DirectoryPerson[]>(queryKeys.org.directory(orgId)) ?? []
        ).length;
        const result = await fetchOrganizationDirectory(orgId, {
          limit: PAGE_SIZE,
          offset: currentLength,
        });
        queryClient.setQueryData<DirectoryPerson[]>(queryKeys.org.directory(orgId), (prev) => [
          ...(prev ?? []),
          ...result.directory,
        ]);
        setHasMore(result.hasMore);
      } catch {
        // Leave hasMore as-is so the "Load more" control stays visible and
        // the user can retry, rather than silently losing the ability to
        // page further on a transient failure.
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [orgId, loadingMore, hasMore, queryClient]);

  return {
    directory: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    hasMore,
    loadingMore,
    loadMore,
  };
}
