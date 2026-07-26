import { Platform } from "react-native";
import { getStoredValue, setStoredValue } from "./local-storage";

const APP_LOCK_STORAGE_KEY = "dg_app_lock_enabled";

// expo-local-authentication has no web implementation; the setting simply
// isn't offered there (mirrors usePushRegistration's pushUnsupported guard).
export const appLockUnsupported = Platform.OS === "web";

let cachedEnabled = false;
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
  return cachedEnabled;
}

/** Reads the persisted setting and refreshes the shared snapshot. */
export async function loadAppLockEnabled(): Promise<boolean> {
  if (appLockUnsupported) return false;
  const stored = await getStoredValue(APP_LOCK_STORAGE_KEY);
  cachedEnabled = stored === "1";
  notify();
  return cachedEnabled;
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await setStoredValue(APP_LOCK_STORAGE_KEY, enabled ? "1" : "0");
  cachedEnabled = enabled;
  notify();
}
