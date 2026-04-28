import { useEffect, useMemo, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { registerPushToken } from "../../../shared/lib/api";
import {
  loadStoredPushDevice,
  saveStoredPushDevice,
  type StoredPushDevice,
} from "../../../shared/lib/session";

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

async function getStoredOrFreshPushDevice(): Promise<StoredPushDevice> {
  const storedDevice = await loadStoredPushDevice();
  if (storedDevice) {
    return storedDevice;
  }

  const response = await Notifications.getExpoPushTokenAsync();
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
      Platform.OS === "web" ? "unsupported" : "undetermined",
    );
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);

  async function refreshPushRegistration(options?: {
    requestPermission?: boolean;
    disable?: boolean;
  }) {
    if (Platform.OS === "web" || !accessToken || !currentOrgId) {
      setPermissionState("unsupported");
      return;
    }

    setIsRegistering(true);
    setError(null);

    try {
      let permissions = await Notifications.getPermissionsAsync();
      let permissionSnapshot = toPermissionSnapshot(permissions);
      if (!permissionSnapshot.granted && options?.requestPermission) {
        permissions = await Notifications.requestPermissionsAsync();
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

      const device = await getStoredOrFreshPushDevice();
      await registerPushToken(accessToken, device);
      await saveStoredPushDevice(device);
    } catch (registrationError) {
      setError(registrationError);
    } finally {
      setIsRegistering(false);
    }
  }

  useEffect(() => {
    if (!autoRegister || !accessToken || !currentOrgId || Platform.OS === "web") {
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
    if (!accessToken || !currentOrgId || Platform.OS === "web") {
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
      isSupported: Platform.OS !== "web",
      enablePush: () => refreshPushRegistration({ requestPermission: true }),
      disablePush: () => refreshPushRegistration({ disable: true }),
      refreshPushRegistration: () => refreshPushRegistration(),
    }),
    [error, isRegistering, permissionState],
  );
}
