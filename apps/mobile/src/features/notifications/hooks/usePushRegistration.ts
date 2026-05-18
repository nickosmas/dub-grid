import { useEffect, useMemo, useRef, useState } from "react";
import type * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { AppState, Platform } from "react-native";
import { registerPushToken } from "../../../shared/lib/api";
import {
  loadStoredPushDevice,
  saveStoredPushDevice,
  type StoredPushDevice,
} from "../../../shared/lib/session";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const pushUnsupported = Platform.OS === "web" || isExpoGo;

// Lazy-load expo-notifications so importing this hook in Expo Go doesn't
// trigger the module's import-time "remote push removed in SDK 53" error.
async function loadNotifications(): Promise<typeof Notifications | null> {
  if (pushUnsupported) return null;
  return await import("expo-notifications");
}

type PushPermissionState =
  | "unsupported"
  | "undetermined"
  | "denied"
  | "granted";

type NotificationPermissionSnapshot = {
  canAskAgain?: boolean;
  granted?: boolean;
};

function toPermissionSnapshot(
  permissions: Notifications.NotificationPermissionsStatus,
): NotificationPermissionSnapshot {
  return permissions as unknown as NotificationPermissionSnapshot;
}

function resolvePermissionState(
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

async function getStoredOrFreshPushDevice(
  notifications: typeof Notifications,
): Promise<StoredPushDevice> {
  const storedDevice = await loadStoredPushDevice();
  if (storedDevice) {
    return storedDevice;
  }

  const response = await notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === "android" ? "android" : "ios";
  const device = {
    expoPushToken: response.data,
    platform,
  } satisfies StoredPushDevice;

  await saveStoredPushDevice(device);
  return device;
}

export function usePushRegistration(
  accessToken: string | null,
  currentOrgId: string | null | undefined,
  options?: {
    autoRegister?: boolean;
  },
) {
  const autoRegister = options?.autoRegister ?? true;
  const [permissionState, setPermissionState] =
    useState<PushPermissionState>(
      pushUnsupported ? "unsupported" : "undetermined",
    );
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);

  async function refreshPushRegistration(options?: {
    requestPermission?: boolean;
    disable?: boolean;
  }) {
    if (pushUnsupported || !accessToken || !currentOrgId) {
      setPermissionState("unsupported");
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const notifications = await loadNotifications();
      if (!notifications) {
        setPermissionState("unsupported");
        return;
      }

      let permissions = await notifications.getPermissionsAsync();
      let permissionSnapshot = toPermissionSnapshot(permissions);
      if (!permissionSnapshot.granted && options?.requestPermission) {
        permissions = await notifications.requestPermissionsAsync();
        permissionSnapshot = toPermissionSnapshot(permissions);
      }

      const nextPermissionState = resolvePermissionState(permissionSnapshot);
      setPermissionState(nextPermissionState);

      if (options?.disable) {
        const storedDevice = await loadStoredPushDevice();
        if (!storedDevice) {
          return;
        }

        await registerPushToken(accessToken, {
          ...storedDevice,
          disabled: true,
        });
        return;
      }

      if (!permissionSnapshot.granted) {
        return;
      }

      const device = await getStoredOrFreshPushDevice(notifications);
      await registerPushToken(accessToken, device);
      await saveStoredPushDevice(device);
    } catch (registrationError) {
      setError(registrationError);
    } finally {
      setIsRegistering(false);
    }
  }

  useEffect(() => {
    if (!autoRegister || !accessToken || !currentOrgId || pushUnsupported) {
      return;
    }

    const nextKey = `${currentOrgId}:${accessToken.slice(0, 12)}`;
    if (attemptedKeyRef.current === nextKey) {
      return;
    }

    attemptedKeyRef.current = nextKey;
    void refreshPushRegistration({ requestPermission: true });
  }, [accessToken, autoRegister, currentOrgId]);

  useEffect(() => {
    if (!accessToken || !currentOrgId || pushUnsupported) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshPushRegistration();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken, currentOrgId]);

  return useMemo(
    () => ({
      permissionState,
      isRegistering,
      error,
      isSupported: !pushUnsupported,
      enablePush: () => refreshPushRegistration({ requestPermission: true }),
      disablePush: () => refreshPushRegistration({ disable: true }),
      refreshPushRegistration: () => refreshPushRegistration(),
    }),
    [error, isRegistering, permissionState],
  );
}
