// Test shim for expo-secure-store — no native keychain in jsdom. Defaults to an
// empty store (getItemAsync -> null = no persisted session).
export async function getItemAsync(): Promise<string | null> {
  return null;
}
export async function setItemAsync(): Promise<void> {}
export async function deleteItemAsync(): Promise<void> {}
