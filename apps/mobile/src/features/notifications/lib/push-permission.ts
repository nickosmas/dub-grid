import type * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Web has no push at all, Expo Go dropped remote push in SDK 53, and an iOS
 * simulator cannot mint a push token: asking it to only raises a library
 * warning on every launch.
 */
export const pushUnsupported =
  Platform.OS === "web" || isExpoGo || (Platform.OS === "ios" && !Device.isDevice);

export type PushPermissionState = "unsupported" | "undetermined" | "denied" | "granted";

export class MissingPushProjectIdError extends Error {
  constructor() {
    super(
      "This build has no Expo project id, so it cannot register for push. " +
        "Set expo.extra.eas.projectId in apps/mobile/app.json (or EAS_PROJECT_ID " +
        "in the build profile) and rebuild.",
    );
    this.name = "MissingPushProjectIdError";
  }
}

/**
 * The project identity a release build mints its push token against.
 *
 * `getExpoPushTokenAsync()` resolves this itself in a development client and
 * throws a generic library error in a standalone build that has none, which
 * reads as a push bug rather than a missing setting. Resolving it here names
 * the setting instead, and the value travels in the token request so both
 * paths agree.
 */
export function resolveExpoProjectId(): string | null {
  const config = Constants.expoConfig as
    { extra?: { eas?: { projectId?: unknown } } } | null | undefined;
  const fromConfig = config?.extra?.eas?.projectId;
  if (typeof fromConfig === "string" && fromConfig.length > 0) return fromConfig;

  const legacy = (Constants as unknown as { easConfig?: { projectId?: unknown } }).easConfig
    ?.projectId;
  if (typeof legacy === "string" && legacy.length > 0) return legacy;

  return null;
}

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
