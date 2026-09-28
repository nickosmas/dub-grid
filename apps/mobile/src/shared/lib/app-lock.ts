import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { getStoredValue, setStoredValue } from "./local-storage";

const APP_LOCK_STORAGE_KEY = "dg_app_lock_enabled";

// expo-local-authentication has no web implementation; the setting simply
// isn't offered there (mirrors usePushRegistration's pushUnsupported guard).
export const appLockUnsupported = Platform.OS === "web";

/**
 * What the lock knows about its stored setting. "loading" until the first read
 * settles and "unreadable" when it fails or stalls: the lock treats that as on,
 * because starting unlocked while the read was pending exposed the app to
 * anyone holding the phone (finding F-17).
 */
export type AppLockState = "loading" | "enabled" | "disabled" | "unreadable";

const READ_DEADLINE_MS = 5_000;
let cachedState: AppLockState = "loading";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeAppLockEnabled(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getAppLockEnabledSnapshot(): boolean {
  return cachedState === "enabled";
}

export function getAppLockStateSnapshot(): AppLockState {
  return cachedState;
}

/** True when the lock must guard the app: on, or not known to be off. */
export function appLockRequired(state: AppLockState): boolean {
  return state === "enabled" || state === "unreadable";
}

/** Reads the persisted setting and refreshes the shared snapshot. */
export async function loadAppLockEnabled(): Promise<boolean> {
  if (appLockUnsupported) return false;
  try {
    const stored = await Promise.race([
      getStoredValue(APP_LOCK_STORAGE_KEY),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("app lock read timed out")), READ_DEADLINE_MS),
      ),
    ]);
    cachedState = stored === "1" ? "enabled" : "disabled";
  } catch {
    cachedState = "unreadable";
  }
  notify();
  return cachedState === "enabled";
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await setStoredValue(APP_LOCK_STORAGE_KEY, enabled ? "1" : "0");
  cachedState = enabled ? "enabled" : "disabled";
  notify();
}

let settingsChecksOpen = 0;

/**
 * True while the security screen's own device check is on screen. iOS reports
 * `inactive` under the system prompt, which would otherwise raise the
 * app-switcher cover over the screen that asked for the check.
 */
export function isSettingsDeviceCheckOpen(): boolean {
  return settingsChecksOpen > 0;
}

export type DeviceCheckResult = "passed" | "failed" | "unavailable";

/** Asks the device owner to confirm with biometrics or the passcode. */
export async function confirmDeviceOwner(promptMessage: string): Promise<DeviceCheckResult> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !isEnrolled) return "unavailable";

  settingsChecksOpen += 1;
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    return result.success ? "passed" : "failed";
  } catch {
    return "failed";
  } finally {
    settingsChecksOpen -= 1;
  }
}

/** What the lock is showing, for the windows the lock page cannot reach. */
export interface AppLockSurfaceState {
  engaged: boolean;
  failed: boolean;
  retrying: boolean;
  retry: () => void;
  signOut: () => void;
}

const idleSurface: AppLockSurfaceState = {
  engaged: false,
  failed: false,
  retrying: false,
  retry: () => undefined,
  signOut: () => undefined,
};
let surface = idleSurface;
const surfaceListeners = new Set<() => void>();

function subscribeLockSurface(callback: () => void): () => void {
  surfaceListeners.add(callback);
  return () => {
    surfaceListeners.delete(callback);
  };
}

/** Published by the lock; `null` when it lifts. */
export function setAppLockSurface(next: AppLockSurfaceState | null): void {
  surface = next ?? idleSurface;
  surfaceListeners.forEach((listener) => listener());
}

/**
 * The lock as seen from a sheet or confirmation. Each is a native window above
 * the app, where the lock page cannot reach, so each draws the lock inside
 * itself instead. Closing them would mean dismissing a confirmation and its
 * sheet at once, which iOS can leave half done.
 */
export function useAppLockSurface(): AppLockSurfaceState {
  return useSyncExternalStore(
    subscribeLockSurface,
    () => surface,
    () => idleSurface,
  );
}
