import { useQuery } from "@tanstack/react-query";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";

export interface ClientFeatureFlags {
  stripe: boolean;
  csvImport: boolean;
  csvExport: boolean;
  reports: boolean;
  printing: boolean;
}

const DEFAULT_FLAGS: ClientFeatureFlags = {
  stripe: true,
  csvImport: true,
  csvExport: true,
  reports: true,
  printing: true,
};

async function fetchClientFeatureFlags(): Promise<ClientFeatureFlags> {
  const response = await fetch("/api/feature-flags");
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(formatClientErrorMessage(body?.error, "Failed to load feature flags"));
  }
  return response.json();
}

/**
 * Client-visible subset of the platform kill switches (lib/feature-flags.ts). Used to
 * proactively disable buttons for a killed feature rather than only failing after the
 * click. Purely a UX layer — the server-side check remains the source of truth, so
 * staleness here (or a failed fetch, hence the fail-open default) only ever affects
 * how quickly a button reflects reality, never enforcement.
 */
export function useClientFeatureFlags(): ClientFeatureFlags {
  const query = useQuery({
    queryKey: queryKeys.featureFlags(),
    queryFn: fetchClientFeatureFlags,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return query.data ?? DEFAULT_FLAGS;
}
