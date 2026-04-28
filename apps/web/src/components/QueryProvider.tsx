"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listenForInvalidations } from "@/lib/cache-broadcast";

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

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    return listenForInvalidations(queryClient);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
