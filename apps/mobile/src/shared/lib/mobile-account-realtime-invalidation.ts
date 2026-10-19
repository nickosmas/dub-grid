import type { QueryClient } from "@tanstack/react-query";
import type { MobileBootstrapResponse } from "@dubgrid/contracts";
import {
  BOOTSTRAP_QUERY_KEY_PREFIX,
  buildBootstrapQueryKey,
} from "../../features/auth/hooks/useBootstrap";
import { getOrgIdFromAccessToken } from "./access-token";
import { mobileQueryKeys } from "./mobile-query-keys";

export type MobileAccountRealtimeTable =
  "profiles" | "user_sessions" | "notification_preferences" | "notifications";

export function getMobileAccountRealtimeInvalidationKeys(
  accessToken: string,
  table: MobileAccountRealtimeTable,
): readonly (readonly unknown[])[] {
  // Prefix-only key — the bootstrap entry is keyed by user id, which is stable
  // across token refreshes and which this module has no reason to restate.
  const bootstrap = ["mobile", "bootstrap"] as const;
  const profile = mobileQueryKeys.profile(accessToken);
  const profileSessions = mobileQueryKeys.profileSessions(accessToken);
  const notificationPreferences = mobileQueryKeys.notificationPreferences(accessToken);
  const notifications = mobileQueryKeys.notificationsPrefix(accessToken);
  const notificationFacets = mobileQueryKeys.notificationFacets(accessToken);
  const notificationDetail = mobileQueryKeys.notificationDetailPrefix(accessToken);

  switch (table) {
    case "profiles":
      return [bootstrap, profile];
    case "user_sessions":
      return [profileSessions];
    case "notification_preferences":
      return [notificationPreferences];
    case "notifications":
      return [notifications, bootstrap, notificationFacets, notificationDetail];
  }
}

export function invalidateMobileAccountRealtimeQueries(
  queryClient: QueryClient,
  accessToken: string,
  table: MobileAccountRealtimeTable,
): void {
  for (const queryKey of getMobileAccountRealtimeInvalidationKeys(accessToken, table)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export type NotificationInsertBootstrapEffect = "none" | "increment" | "invalidate";

/**
 * What an inserted notification does to bootstrap's unread count, by the rule
 * `get_unread_notification_count` counts with. A row arriving already read or
 * archived (the new-device alert does) changes nothing.
 */
export function getNotificationInsertBootstrapEffect(
  row: Record<string, unknown> | undefined,
  orgId: string | null,
): NotificationInsertBootstrapEffect {
  if (!row || !("read_at" in row) || !("archived_at" in row) || !("channel" in row)) {
    return "invalidate";
  }
  if (row.read_at != null || row.archived_at != null || row.channel !== "in_app") {
    return "none";
  }
  if (row.org_id != null && row.org_id !== orgId) {
    return "none";
  }
  return "increment";
}

/**
 * An insert refreshes the inbox and adds one to the cached unread count
 * instead of refetching all of bootstrap. A bootstrap fetch already in flight
 * may predate the row, so it is restarted rather than written over.
 */
export function applyMobileNotificationInsert(
  queryClient: QueryClient,
  accessToken: string,
  row: Record<string, unknown> | undefined,
): void {
  for (const queryKey of [
    mobileQueryKeys.notificationsPrefix(accessToken),
    mobileQueryKeys.notificationFacets(accessToken),
    mobileQueryKeys.notificationDetailPrefix(accessToken),
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }

  const effect = getNotificationInsertBootstrapEffect(row, getOrgIdFromAccessToken(accessToken));
  if (effect === "none") return;

  const bootstrapKey = buildBootstrapQueryKey(accessToken);
  const canIncrement =
    effect === "increment" &&
    queryClient.getQueryData(bootstrapKey) !== undefined &&
    queryClient.isFetching({ queryKey: bootstrapKey, exact: true }) === 0;
  if (canIncrement) {
    queryClient.setQueryData<MobileBootstrapResponse>(bootstrapKey, (current) =>
      current
        ? { ...current, unreadNotificationCount: current.unreadNotificationCount + 1 }
        : current,
    );
    return;
  }

  void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY_PREFIX });
}
