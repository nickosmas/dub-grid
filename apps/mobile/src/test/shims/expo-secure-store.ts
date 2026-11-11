// Test shim for expo-secure-store — no native keychain in jsdom. Defaults to an
// empty store (getItemAsync -> null = no persisted session).
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export async function getItemAsync(): Promise<string | null> {
  return null;
}
export async function setItemAsync(): Promise<void> {}
export async function deleteItemAsync(): Promise<void> {}
export function canUseBiometricAuthentication(): boolean {
  return false;
}
