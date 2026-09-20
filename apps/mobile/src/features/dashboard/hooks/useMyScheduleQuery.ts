import { useQuery } from "@tanstack/react-query";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { getMySchedule } from "../../../shared/lib/api";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";

/**
 * The signed-in user's own shifts for the dashboard's period, as shown by
 * `MyScheduleCard`. The range follows the period toggle, so Week shows one
 * week and 2 Weeks shows two; without one the API answers with its own
 * forward-looking window.
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
export function useMyScheduleQuery(
  accessToken: string | null,
  options?: { enabled?: boolean; range?: MobileScheduleRange },
) {
  const range = options?.range;
  return useQuery({
    queryKey: mobileQueryKeys.dashboardSchedule(accessToken, range),
    queryFn: ({ signal }) => getMySchedule(accessToken!, range, signal),
    enabled: Boolean(accessToken) && (options?.enabled ?? true),
    // The range is part of the key, so a period change would otherwise drop
    // the card to nothing until the new week lands. Keep the old one dimmed.
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
}
