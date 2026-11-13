import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

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

// auth-js re-reads its session on every getSession(), realtime heartbeats
// included, and each SecureStore read crosses into the keychain or keystore.
// Every write to these keys comes through here, so a value read or written once
// is kept in memory. A write bumps the key's version, so a read that started
// before it can't put the old value back.
const cachedValues = new Map<string, string | null>();
const pendingReads = new Map<string, Promise<string | null>>();
const versions = new Map<string, number>();

function bumpVersion(key: string): number {
  const next = (versions.get(key) ?? 0) + 1;
  versions.set(key, next);
  cachedValues.delete(key);
  pendingReads.delete(key);
  return next;
}

function readSecureValue(key: string): Promise<string | null> {
  if (cachedValues.has(key)) return Promise.resolve(cachedValues.get(key) ?? null);
  const pending = pendingReads.get(key);
  if (pending) return pending;

  const version = versions.get(key) ?? 0;
  const read = SecureStore.getItemAsync(key)
    .then((value) => {
      if ((versions.get(key) ?? 0) === version) cachedValues.set(key, value);
      return value;
    })
    .finally(() => {
      if (pendingReads.get(key) === read) pendingReads.delete(key);
    });
  pendingReads.set(key, read);
  return read;
}

export async function getStoredValue(key: string): Promise<string | null> {
  const webStorage = getWebStorage();
  if (webStorage) {
    return webStorage.getItem(key);
  }

  return readSecureValue(key);
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.setItem(key, value);
    return;
  }

  const version = bumpVersion(key);
  await SecureStore.setItemAsync(key, value);
  if (versions.get(key) === version) cachedValues.set(key, value);
}

export async function removeStoredValue(key: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.removeItem(key);
    return;
  }

  const version = bumpVersion(key);
  await SecureStore.deleteItemAsync(key);
  if (versions.get(key) === version) cachedValues.set(key, null);
}
