import { getStoredValue, removeStoredValue, setStoredValue } from "./local-storage";

const LAST_ORG_KEY = "dubgrid-mobile-last-org";
const PUSH_DEVICE_KEY = "dubgrid-mobile-push-device";
const HAS_SEEN_ONBOARDING_KEY = "dubgrid-mobile-has-seen-onboarding";

export type StoredPushDevice = {
  expoPushToken: string;
  platform: "ios" | "android";
};

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

export type StoredLastOrg = {
  slug: string;
  /**
   * The organization's full name, cached so login can greet a returning user
   * with it immediately. Null when we've never seen one (a legacy record, or a
   * slug saved before any lookup answered).
   */
  name: string | null;
};

export async function saveLastOrg(org: {
  slug: string | null;
  name?: string | null;
}): Promise<void> {
  const normalized = org.slug?.trim().toLowerCase() ?? null;
  if (!normalized) {
    await removeStoredValue(LAST_ORG_KEY);
    return;
  }

  await saveJsonValue<StoredLastOrg>(LAST_ORG_KEY, {
    slug: normalized,
    name: org.name?.trim() || null,
  });
}

export async function loadLastOrg(): Promise<StoredLastOrg | null> {
  const raw = await getStoredValue(LAST_ORG_KEY);
  if (!raw) return null;

  // Installs that last wrote this key before names were cached hold a bare
  // slug string. Read it rather than discarding the remembered organization.
  if (!raw.startsWith("{")) {
    return { slug: raw, name: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLastOrg>;
    if (!parsed.slug) {
      await removeStoredValue(LAST_ORG_KEY);
      return null;
    }
    return { slug: parsed.slug, name: parsed.name ?? null };
  } catch {
    await removeStoredValue(LAST_ORG_KEY);
    return null;
  }
}

export async function saveStoredPushDevice(device: StoredPushDevice | null): Promise<void> {
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
