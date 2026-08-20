import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../../../shared/lib/query-client";
import { loadHasSeenOnboarding, saveHasSeenOnboarding } from "../../../shared/lib/session";

export const HAS_SEEN_ONBOARDING_QUERY_KEY = ["mobile", "has-seen-onboarding"] as const;

/**
 * The first-run flag, read through react-query so the launch gate and the
 * index route share one answer from one storage read. They have to agree: the
 * gate lifts the splash on it, and the index route decides between the login
 * screen and the onboarding tour on it. Two independent reads could disagree
 * for a frame and flash the login screen at a first-run user.
 *
 * `staleTime: Infinity` because the only thing that changes it is
 * `markHasSeenOnboarding`, which writes the new value straight into this cache.
 */
export function useHasSeenOnboarding() {
  return useQuery({
    queryKey: HAS_SEEN_ONBOARDING_QUERY_KEY,
    queryFn: loadHasSeenOnboarding,
    staleTime: Infinity,
  });
}

/**
 * Flip the flag in device storage and in the cache together. Writing only to
 * storage would leave the cached answer stale for the rest of the session, and
 * anything that navigated back to the index route would be sent to onboarding
 * again on a flag that storage says is already set.
 */
export async function markHasSeenOnboarding(seen: boolean): Promise<void> {
  await saveHasSeenOnboarding(seen);
  queryClient.setQueryData(HAS_SEEN_ONBOARDING_QUERY_KEY, seen);
}
