"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { decodeJwt } from "jose";
import { extractJwtClaims } from "@dubgrid/authz";
import { useAuth } from "@/components/AuthProvider";
import { organizationBillingQueryOptions } from "@/features/billing/queries";
import { getOrganizationBootstrapQueryPolicy } from "@/features/organization/client/api";
import { accountPermissionsQueryOptions } from "@/features/permissions/client";
import { employeesQueryOptions } from "@/hooks/useEmployees";
import { orgContextQueryOptions } from "@/hooks/useOrganizationData";
import { termsAcceptanceQueryOptions } from "@/hooks/useTermsAcceptanceStatus";
import { useAuthTransitionPending } from "@/lib/auth-transition";
import { queryKeys } from "@/lib/query-keys";

interface SignInTarget {
  userId: string;
  orgId: string;
  isSuperAdmin: boolean;
}

/** The organization member a token signs in, or null for anyone the app shell does not load for. */
function signInTarget(accessToken: string): SignInTarget | null {
  let userId: string | undefined;
  try {
    userId = decodeJwt(accessToken).sub;
  } catch {
    return null;
  }
  const { effectiveRole, orgId } = extractJwtClaims(accessToken);
  if (!userId || !orgId || effectiveRole === "gridmaster") return null;
  return { userId, orgId, isSuperAdmin: effectiveRole === "super_admin" };
}

function bootstrapQueryOptions() {
  return { queryKey: queryKeys.org.bootstrap(), ...getOrganizationBootstrapQueryPolicy() };
}

/**
 * Starts what the first app screen reads the moment a sign-in's session
 * exists, under the same keys its components use. Without it each piece waited
 * for the one before: OnboardingGate holds the shell until permissions and
 * organization data resolve, the header holds a Super Admin's employees behind
 * billing, and the dashboard holds its own data behind employees.
 *
 * Employees are asked for alongside billing even though the header waits: a
 * locked organization answers with an error nothing here displays, and its
 * members are sent to billing recovery before any screen reads the list.
 */
export function primeSignInQueries(queryClient: QueryClient, accessToken: string): void {
  const target = signInTarget(accessToken);
  if (!target) return;

  void queryClient.prefetchQuery(accountPermissionsQueryOptions(target.userId, target.orgId));
  void queryClient.prefetchQuery(bootstrapQueryOptions());
  void queryClient.prefetchQuery(orgContextQueryOptions());
  void queryClient.prefetchQuery(termsAcceptanceQueryOptions(target.userId));
  void queryClient.prefetchQuery(employeesQueryOptions(target.orgId));
  if (target.isSuperAdmin) {
    void queryClient.prefetchQuery(organizationBillingQueryOptions(target.orgId));
  }
}

/**
 * Keeps the sign-in queries observed until the handoff ends. OnboardingGate
 * swaps its tree as permissions and organization data resolve, which unmounts
 * the shell; the bootstrap request consumes its abort signal, so losing its
 * last observer mid-request cancelled it and it was asked again. Mounted above
 * the gate, this stays put. It also primes the queries on a hard navigation
 * after an organization switch, where the sign-in form is no longer running.
 */
export default function SignInPrefetch() {
  const pending = useAuthTransitionPending();
  const { session } = useAuth();
  const accessToken = pending ? (session?.access_token ?? null) : null;
  return accessToken && signInTarget(accessToken) ? (
    <HoldSignInQueries accessToken={accessToken} />
  ) : null;
}

function HoldSignInQueries({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    primeSignInQueries(queryClient, accessToken);
  }, [queryClient, accessToken]);
  useQuery(bootstrapQueryOptions());
  return null;
}
