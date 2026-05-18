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

/**
 * Returns the source org id of the active sandbox, if the caller is in
 * sandbox mode. Components that want to fall back to the real workspace's
 * data while in sandbox (e.g. Billing displaying the real subscription)
 * can use this id without re-running the bootstrap query.
 */
export function useSandboxSourceOrgId(): string | null {
  const { data } = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(null, false),
    queryFn: () => fetchOrganizationBootstrap({ includeAssignments: false }),
    staleTime: 60_000,
  });
  const org = data?.org;
  if (!org || org.workspaceKind !== "sandbox") return null;
  return org.sandboxSourceOrgId ?? null;
}
