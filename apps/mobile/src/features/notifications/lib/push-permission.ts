import type * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Web has no push at all, and Expo Go dropped remote push in SDK 53. */
export const pushUnsupported = Platform.OS === "web" || isExpoGo;

export type PushPermissionState = "unsupported" | "undetermined" | "denied" | "granted";

export type NotificationPermissionSnapshot = {
  canAskAgain?: boolean;
  granted?: boolean;
};

// Lazy-loaded so importing this module in Expo Go doesn't trigger
// expo-notifications' import-time "remote push removed in SDK 53" error.
export async function loadNotifications(): Promise<typeof Notifications | null> {
  if (pushUnsupported) return null;
  return await import("expo-notifications");
}

export function toPermissionSnapshot(
  permissions: Notifications.NotificationPermissionsStatus,
): NotificationPermissionSnapshot {
  return permissions as unknown as NotificationPermissionSnapshot;
}

export function resolvePermissionState(
  permissions: NotificationPermissionSnapshot | "unsupported",
): PushPermissionState {
  if (permissions === "unsupported") {
    return "unsupported";
  }

  if (permissions.granted) {
    return "granted";
  }

  return permissions.canAskAgain ? "undetermined" : "denied";
}

/** The device's current answer, without showing the system prompt. */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  const notifications = await loadNotifications();
  if (!notifications) {
    return "unsupported";
  }

  return resolvePermissionState(toPermissionSnapshot(await notifications.getPermissionsAsync()));
}

/**
 * Shows the system prompt and reports the answer. The OS only shows it while
 * the answer is still `undetermined`; on a decided device this resolves
 * straight to the stored decision.
 */
export async function requestPushPermission(): Promise<PushPermissionState> {
  const notifications = await loadNotifications();
  if (!notifications) {
    return "unsupported";
  }

  return resolvePermissionState(
    toPermissionSnapshot(await notifications.requestPermissionsAsync()),
  );
}
