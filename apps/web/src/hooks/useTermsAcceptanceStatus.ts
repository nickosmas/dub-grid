// src/hooks/useTermsAcceptanceStatus.ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchTermsAcceptanceStatus,
  type TermsAcceptanceStatus,
} from "@/features/account/client";

/**
 * Shared current-terms acceptance status for the signed-in user.
 *
 * Keyed by the stable user **id string** (not the user object), so the
 * `SIGNED_IN` / `TOKEN_REFRESHED` re-renders that mint a new `user` reference
 * no longer re-fire the fetch. Consumers include the `/accept-terms` page (for
 * the already-accepted redirect) and `TrialWelcomeModal` (gated behind
 * acceptance).
 */
export function useTermsAcceptanceStatus(): UseQueryResult<TermsAcceptanceStatus> {
  const { user, isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.account.terms(user?.id ?? "anon"),
    queryFn: fetchTermsAcceptanceStatus,
    enabled: Boolean(user) && !authLoading,
    staleTime: 60_000,
  });
}
