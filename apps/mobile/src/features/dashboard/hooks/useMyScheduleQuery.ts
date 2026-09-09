import { useQuery } from "@tanstack/react-query";
import { getMySchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";

/**
 * The signed-in user's own upcoming shifts, as shown by `MyScheduleCard`.
 *
 * Extracted from the card so the dashboard can wait on it too. The card used
 * to own the query and render `null` while it loaded, which meant it appeared
 * *after* the page skeleton had already cleared and pushed everything below it
 * down. Folding this into the screen's content state makes it part of the one
 * skeleton the screen shows.
 *
 * Both callers use the same key, so React Query still issues a single fetch —
 * no prop drilling needed to share it.
 *
 * The `["mobile", "dashboard", ...]` prefix is load-bearing: manual
 * pull-to-refresh and realtime invalidation both target that prefix.
 */
export function useMyScheduleQuery(accessToken: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: mobileQueryKeys.dashboardSchedule(accessToken),
    queryFn: ({ signal }) => getMySchedule(accessToken!, undefined, signal),
    enabled: Boolean(accessToken) && (options?.enabled ?? true),
  });
}
