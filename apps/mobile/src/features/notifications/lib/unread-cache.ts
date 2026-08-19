import type { QueryClient } from "@tanstack/react-query";
import { buildBootstrapQueryKey } from "../../auth/hooks/useBootstrap";

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
 *
 * Goes through `buildBootstrapQueryKey` rather than restating the key: this
 * wrote to `["mobile","bootstrap", accessToken]` while the query itself was
 * keyed on the token's claims, so every call was a silent no-op and the badge
 * never got its patch.
 */
export function setBootstrapUnreadCount(
  queryClient: QueryClient,
  accessToken: string | null,
  count: number,
): void {
  queryClient.setQueryData(
    buildBootstrapQueryKey(accessToken),
    (current: { unreadNotificationCount: number } | undefined) =>
      current ? { ...current, unreadNotificationCount: count } : current,
  );
}
