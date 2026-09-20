import { useEffect, useMemo, useRef, useState } from "react";
import type * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { registerPushToken } from "../../../shared/lib/api";
import {
  loadStoredPushDevice,
  saveStoredPushDevice,
  type StoredPushDevice,
} from "../../../shared/lib/session";
import {
  loadNotifications,
  pushUnsupported,
  resolvePermissionState,
  toPermissionSnapshot,
  type PushPermissionState,
} from "../lib/push-permission";

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
  const [permissionState, setPermissionState] = useState<PushPermissionState>(
    pushUnsupported ? "unsupported" : "undetermined",
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const attemptedKeyRef = useRef<string | null>(null);

  /**
   * Resolves true only when the device row was actually written for the current
   * org. The auto-register effect below uses that to decide whether it may stop
   * trying: the push row is keyed on the Expo token and carries an `org_id`, so
   * a registration that never lands after an org switch leaves the device
   * receiving the PREVIOUS org's notifications.
   */
  async function refreshPushRegistration(options?: {
    requestPermission?: boolean;
    disable?: boolean;
  }): Promise<boolean> {
    if (pushUnsupported || !accessToken || !currentOrgId) {
      setPermissionState("unsupported");
      return false;
    }

    setIsRegistering(true);
    setError(null);

    try {
      const notifications = await loadNotifications();
      if (!notifications) {
        setPermissionState("unsupported");
        return false;
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
          return true;
        }

        await registerPushToken(accessToken, {
          ...storedDevice,
          disabled: true,
        });
        return true;
      }

      if (!permissionSnapshot.granted) {
        return false;
      }

      const device = await getStoredOrFreshPushDevice(notifications);
      await registerPushToken(accessToken, device);
      await saveStoredPushDevice(device);
      return true;
    } catch (registrationError) {
      setError(registrationError);
      return false;
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

    // Latched up front so a re-render cannot start a second registration for
    // the same key, then RELEASED again if that attempt did not land. Latching
    // once and never releasing meant a registration that failed — offline, a
    // 5xx, a timeout — was never retried, and after an org switch the device
    // kept the previous org's id on its push row and went on receiving that
    // org's notifications.
    //
    // Never prompts. The first-run tour asks for the permission with context,
    // and someone who answered "Not now" there would otherwise meet the bare
    // system prompt the moment they signed in. This registers a device that
    // already said yes; the switch in Profile > Notifications asks otherwise.
    attemptedKeyRef.current = nextKey;
    void refreshPushRegistration().then((registered) => {
      if (!registered && attemptedKeyRef.current === nextKey) {
        attemptedKeyRef.current = null;
      }
    });
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
