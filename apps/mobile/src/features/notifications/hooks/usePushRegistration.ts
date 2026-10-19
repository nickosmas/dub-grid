import { useEffect, useMemo, useRef, useState } from "react";
import type * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { getUserIdFromAccessToken } from "../../../shared/lib/access-token";
import { registerPushToken } from "../../../shared/lib/api";
import {
  loadStoredPushDevice,
  loadStoredPushRegistration,
  saveStoredPushDevice,
  saveStoredPushRegistration,
  type StoredPushDevice,
  type StoredPushRegistration,
} from "../../../shared/lib/session";
import {
  loadNotifications,
  MissingPushProjectIdError,
  pushUnsupported,
  resolveExpoProjectId,
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

  // A standalone build resolves nothing on its own, so the missing setting is
  // named here rather than surfacing as the library's generic failure.
  const projectId = resolveExpoProjectId();
  if (!projectId) {
    throw new MissingPushProjectIdError();
  }
  const response = await notifications.getExpoPushTokenAsync({ projectId });
  const platform = Platform.OS === "android" ? "android" : "ios";
  const device = {
    expoPushToken: response.data,
    platform,
  } satisfies StoredPushDevice;

  await saveStoredPushDevice(device);
  return device;
}

/** How long a landed registration is trusted before a foreground renews it. */
export const PUSH_REGISTRATION_REFRESH_MS = 24 * 60 * 60_000;

export function buildPushRegistrationKey(
  userId: string | null,
  orgId: string,
  expoPushToken: string,
): string {
  return JSON.stringify([userId, orgId, expoPushToken]);
}

/**
 * Whether the last registration already covers this person, organization and
 * device token. Re-registering on every foreground sent the same row again;
 * a change to any of the three, or a day passing, sends it.
 */
export function isPushRegistrationCurrent(
  stored: StoredPushRegistration | null,
  key: string,
  now: number,
): boolean {
  if (!stored || stored.key !== key) return false;
  const age = now - stored.registeredAt;
  return age >= 0 && age < PUSH_REGISTRATION_REFRESH_MS;
}

async function forgetPushRegistration(): Promise<void> {
  await saveStoredPushRegistration(null).catch(() => undefined);
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
        await forgetPushRegistration();
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
        // So a permission granted again later registers at once.
        await forgetPushRegistration();
        return false;
      }

      const device = await getStoredOrFreshPushDevice(notifications);
      const registrationKey = buildPushRegistrationKey(
        getUserIdFromAccessToken(accessToken),
        currentOrgId,
        device.expoPushToken,
      );
      const stored = options?.requestPermission
        ? null
        : await loadStoredPushRegistration().catch(() => null);
      if (isPushRegistrationCurrent(stored, registrationKey, Date.now())) {
        return true;
      }

      await registerPushToken(accessToken, device);
      await saveStoredPushDevice(device);
      await saveStoredPushRegistration({ key: registrationKey, registeredAt: Date.now() }).catch(
        () => undefined,
      );
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

    // The token's own first characters are its JWT header, the same for
    // every account, so they never told one person from another.
    const nextKey = `${getUserIdFromAccessToken(accessToken)}:${currentOrgId}`;
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
