import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function QueryWrapper({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const qc = client ?? createTestQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

export function renderWithQuery(
  ui: ReactElement,
  options?: RenderOptions & { client?: QueryClient },
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.client ?? createTestQueryClient();
  const result = render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    ...options,
  });
  return Object.assign(result, { queryClient });
}
