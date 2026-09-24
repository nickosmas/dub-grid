import { Platform } from "react-native";
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
