"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listenForInvalidations } from "@/lib/cache-broadcast";
import { clientEnv } from "@/lib/env";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30s — matches previous module-cache TTL
        gcTime: 5 * 60_000, // 5 min garbage collection
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

const PERF_TIMING =
  clientEnv?.NEXT_PUBLIC_PERF_TIMING === "1" || process.env.NODE_ENV === "development";

/**
 * Dev/perf-only logger: records each query's fetch duration and cache
 * hit/miss, plus mutation timings, via the built-in cache subscribe API
 * (no extra dependency). Surfaces the useEmployees→useOrganizationData
 * waterfall and realtime-invalidation refetch cascades. Gated behind
 * NEXT_PUBLIC_PERF_TIMING (always on in dev).
 */
function attachPerfLogger(client: QueryClient): () => void {
  if (!PERF_TIMING || typeof window === "undefined") return () => {};

  const starts = new Map<string, number>();

  const unsubQueries = client.getQueryCache().subscribe((event) => {
    const { query } = event;
    const key = query.queryHash;
    if (query.state.fetchStatus === "fetching" && !starts.has(key)) {
      starts.set(key, performance.now());
    } else if (query.state.fetchStatus === "idle" && starts.has(key)) {
      const dur = performance.now() - (starts.get(key) ?? 0);
      starts.delete(key);
      console.debug(`%c[rq] ${query.queryKey[0]}`, "color:#0a84ff", `${dur.toFixed(0)}ms`, {
        key: query.queryKey,
        status: query.state.status,
      });
    }
  });

  const unsubMutations = client.getMutationCache().subscribe((event) => {
    const m = event.mutation;
    if (!m) return;
    if (m.state.status === "pending") {
      starts.set(`mut:${m.mutationId}`, performance.now());
    } else if (
      (m.state.status === "success" || m.state.status === "error") &&
      starts.has(`mut:${m.mutationId}`)
    ) {
      const dur = performance.now() - (starts.get(`mut:${m.mutationId}`) ?? 0);
      starts.delete(`mut:${m.mutationId}`);
      console.debug(`%c[rq:mutation]`, "color:#ff9f0a", `${dur.toFixed(0)}ms`, {
        key: m.options.mutationKey,
        status: m.state.status,
      });
    }
  });

  return () => {
    unsubQueries();
    unsubMutations();
  };
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    return listenForInvalidations(queryClient);
  }, [queryClient]);

  useEffect(() => attachPerfLogger(queryClient), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
