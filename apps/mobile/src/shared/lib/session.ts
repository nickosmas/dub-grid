import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "dubgrid-mobile-session";
const LAST_ORG_KEY = "dubgrid-mobile-last-org";
const PUSH_DEVICE_KEY = "dubgrid-mobile-push-device";
const HAS_SEEN_ONBOARDING_KEY = "dubgrid-mobile-has-seen-onboarding";

export type StoredPushDevice = {
  expoPushToken: string;
  platform: "ios" | "android";
};

function getWebStorage(): Storage | null {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function getStoredValue(key: string): Promise<string | null> {
  const webStorage = getWebStorage();
  if (webStorage) {
    return webStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function removeStoredValue(key: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export const secureStoreAdapter = {
  getItem(key: string) {
    return getStoredValue(key);
  },
  setItem(key: string, value: string) {
    return setStoredValue(key, value);
  },
  removeItem(key: string) {
    return removeStoredValue(key);
  },
};

async function loadJsonValue<T>(key: string): Promise<T | null> {
  const raw = await getStoredValue(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    await removeStoredValue(key);
    return null;
  }
}

async function saveJsonValue<T>(key: string, value: T | null): Promise<void> {
  if (value == null) {
    await removeStoredValue(key);
    return;
  }

  await setStoredValue(key, JSON.stringify(value));
}

export async function saveSession(session: Session | null): Promise<void> {
  if (!session) {
    await removeStoredValue(SESSION_KEY);
    return;
  }
  await setStoredValue(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  return loadJsonValue<Session>(SESSION_KEY);
}

export async function saveLastOrgSlug(slug: string | null): Promise<void> {
  const normalized = slug?.trim().toLowerCase() ?? null;
  if (!normalized) {
    await removeStoredValue(LAST_ORG_KEY);
    return;
  }

  await setStoredValue(LAST_ORG_KEY, normalized);
}

export async function loadLastOrgSlug(): Promise<string | null> {
  return getStoredValue(LAST_ORG_KEY);
}

export async function saveStoredPushDevice(
  device: StoredPushDevice | null,
): Promise<void> {
  await saveJsonValue(PUSH_DEVICE_KEY, device);
}

export async function loadStoredPushDevice(): Promise<StoredPushDevice | null> {
  return loadJsonValue<StoredPushDevice>(PUSH_DEVICE_KEY);
}

export async function loadHasSeenOnboarding(): Promise<boolean> {
  const raw = await getStoredValue(HAS_SEEN_ONBOARDING_KEY);
  return raw === "true";
}

export async function saveHasSeenOnboarding(seen: boolean): Promise<void> {
  if (!seen) {
    await removeStoredValue(HAS_SEEN_ONBOARDING_KEY);
    return;
  }

  await setStoredValue(HAS_SEEN_ONBOARDING_KEY, "true");
}
