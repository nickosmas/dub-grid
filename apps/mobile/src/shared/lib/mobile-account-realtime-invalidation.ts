import type { QueryClient } from "@tanstack/react-query";
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
