import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
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

async function fetchClientFeatureFlags(signal?: AbortSignal): Promise<ClientFeatureFlags> {
  const response = await fetch("/api/feature-flags", { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      formatClientErrorMessage(
        body?.error,
        "We couldn't load feature flags. Refresh and try again.",
      ),
    );
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
  const { user } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.featureFlags(),
    queryFn: ({ signal }) => fetchClientFeatureFlags(signal),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return query.data ?? DEFAULT_FLAGS;
}
