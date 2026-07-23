// Test shim for expo-local-authentication — no native biometric/passcode
// prompt in jsdom. Defaults to "unsupported" so AppLockProvider fails open
// rather than showing a lock screen tests can't dismiss.
export async function hasHardwareAsync(): Promise<boolean> {
  return false;
}
export async function isEnrolledAsync(): Promise<boolean> {
  return false;
}
export async function authenticateAsync(): Promise<{ success: boolean }> {
  return { success: false };
}
