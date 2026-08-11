import type { QueryClient } from "@tanstack/react-query";

/**
 * Patches the unread badge straight into the bootstrap cache.
 *
 * The badge reads `unreadNotificationCount` off the bootstrap query, so without
 * this a read/archive only clears once a bootstrap refetch lands. On a slow
 * connection that leaves the tab showing a count for alerts the user has
 * already opened, which reads as the app being wrong rather than merely slow.
 *
 * The endpoints return the authoritative post-write count, so this is a patch
 * with a server number, not an optimistic guess.
 */
export function setBootstrapUnreadCount(
  queryClient: QueryClient,
  accessToken: string | null,
  count: number,
): void {
  queryClient.setQueryData(
    ["mobile", "bootstrap", accessToken],
    (current: { unreadNotificationCount: number } | undefined) =>
      current ? { ...current, unreadNotificationCount: count } : current,
  );
}
