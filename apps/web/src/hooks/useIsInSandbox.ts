"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Returns true when the active org for this request is a sandbox.
 *
 * Use this to gray out / disable side-effecting buttons (invitations,
 * billing actions, GDPR export/erasure, etc.). The server enforces the
 * same gate via forbidIfSandboxCookie, so failing to gate the UI is a
 * UX bug, not a security bug — the worst that happens is a 403 toast.
 *
 * Shares the same query key as the bootstrap fetcher so there's no
 * extra network request; this is just a thin selector over cached data.
 */
export function useIsInSandbox(): boolean {
  const { data } = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(null, false),
    queryFn: () => fetchOrganizationBootstrap({ includeAssignments: false }),
    staleTime: 60_000,
  });
  return data?.org?.workspaceKind === "sandbox";
}
