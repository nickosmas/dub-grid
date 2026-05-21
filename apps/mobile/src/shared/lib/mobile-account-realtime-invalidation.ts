import type { QueryClient } from "@tanstack/react-query";

export type MobileAccountRealtimeTable =
  | "profiles"
  | "user_sessions"
  | "notification_preferences"
  | "notifications";

export function getMobileAccountRealtimeInvalidationKeys(
  accessToken: string,
  table: MobileAccountRealtimeTable,
): readonly (readonly unknown[])[] {
  const bootstrap = ["mobile", "bootstrap", accessToken] as const;
  const profile = ["mobile", "profile", accessToken] as const;
  // Prefix-only key — matches every variant of the profile namespace
  // (sessions, notification-preferences, etc.).
  const profileAll = ["mobile", "profile"] as const;
  const notifications = ["mobile", "notifications-infinite"] as const;
  const notificationFacets = [
    "mobile",
    "notification-facets",
    accessToken,
  ] as const;

  switch (table) {
    case "profiles":
      return [bootstrap, profile, profileAll];
    case "user_sessions":
      return [profileAll];
    case "notification_preferences":
      return [profileAll];
    case "notifications":
      return [notifications, bootstrap, notificationFacets];
  }
}

export function invalidateMobileAccountRealtimeQueries(
  queryClient: QueryClient,
  accessToken: string,
  table: MobileAccountRealtimeTable,
): void {
  for (const queryKey of getMobileAccountRealtimeInvalidationKeys(
    accessToken,
    table,
  )) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
