import { ApiResponseError } from "@dubgrid/api-client";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { appLockUnsupported, getAppLockEnabledSnapshot, withDeviceCheckOpen } from "./app-lock";

const PASSWORD_KEY = "dg_step_up_password";
const OWNER_KEY = "dg_step_up_password_owner";
// Its own keychain service, so a Keystore key Android invalidates (a new
// fingerprint) can only ever take this value with it, never the session.
const KEYCHAIN_SERVICE = "dg_step_up";

const OWNER_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// iOS `.biometryCurrentSet` and Android `BIOMETRIC_STRONG`: biometrics only, no
// passcode, and the value stops opening when a face or finger is enrolled.
function protectedOptions(authenticationPrompt: string): SecureStore.SecureStoreOptions {
  return {
    keychainService: KEYCHAIN_SERVICE,
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt,
  };
}

export const BIOMETRIC_STEP_UP_PROMPT = "Confirm it's you";
export const BIOMETRIC_STEP_UP_SAVE_PROMPT = "Use biometrics to confirm it's you next time";

export interface BiometricStepUpChoiceInput {
  method: "password" | "totp";
  appLockEnabled: boolean;
  unsupported: boolean;
  userId: string | null;
  savedOwner: string | null;
}

/**
 * Biometrics stand in only for typing the password. A two-factor code is never
 * stored, since that would leave both factors on the phone.
 */
export function shouldUseBiometricStepUp(input: BiometricStepUpChoiceInput): boolean {
  return (
    input.method === "password" &&
    input.appLockEnabled &&
    !input.unsupported &&
    input.userId !== null &&
    input.savedOwner === input.userId
  );
}

/** Only the password check refusing the saved copy proves it is wrong. */
export function isRefusedSavedPassword(error: unknown): boolean {
  if (!(error instanceof ApiResponseError) || error.status !== 403) return false;
  const payload = error.payload as { code?: unknown } | null;
  return !payload || typeof payload !== "object" || payload.code !== "STEP_UP_REQUIRED";
}

async function readOwner(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(OWNER_KEY, OWNER_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * The saved password for this user, released by Face ID or a fingerprint, or
 * null whenever the typed sheet should ask instead: biometric unlock off, no
 * copy (or another user's), or the prompt cancelled, failed or invalidated.
 */
export async function readSavedStepUpPassword(
  method: "password" | "totp",
  userId: string | null,
): Promise<string | null> {
  const savedOwner = await readOwner();
  if (savedOwner !== null && savedOwner !== userId) {
    await clearSavedStepUpPassword();
    return null;
  }
  const useBiometrics = shouldUseBiometricStepUp({
    method,
    appLockEnabled: getAppLockEnabledSnapshot(),
    unsupported: appLockUnsupported,
    userId,
    savedOwner,
  });
  if (!useBiometrics) return null;
  try {
    const password = await withDeviceCheckOpen(() =>
      SecureStore.getItemAsync(PASSWORD_KEY, protectedOptions(BIOMETRIC_STEP_UP_PROMPT)),
    );
    return password || null;
  } catch {
    return null;
  }
}

/**
 * Keeps a password the server just accepted, for the next check. Best effort:
 * not saving only means typing it again. Android asks for the fingerprint here.
 */
export async function saveStepUpPassword(userId: string | null, password: string): Promise<void> {
  if (appLockUnsupported || !getAppLockEnabledSnapshot() || !userId || !password) return;
  try {
    if (!SecureStore.canUseBiometricAuthentication()) return;
    // Deleting first keeps iOS from asking for Face ID to update the old copy.
    await clearSavedStepUpPassword();
    await withDeviceCheckOpen(() =>
      SecureStore.setItemAsync(
        PASSWORD_KEY,
        password,
        protectedOptions(BIOMETRIC_STEP_UP_SAVE_PROMPT),
      ),
    );
    await SecureStore.setItemAsync(OWNER_KEY, userId, OWNER_OPTIONS);
  } catch {
    await clearSavedStepUpPassword();
  }
}

/**
 * Keeps the password someone just signed in with, so their first identity
 * check can use Face ID instead of asking them to type it again (owner,
 * 2026-11-13). iPhone only: iOS saves the copy without a prompt, where Android
 * would ask for a fingerprint at sign-in, so Android keeps saving it after the
 * first typed check.
 */
export async function rememberSignInPassword(
  userId: string | null,
  password: string,
): Promise<void> {
  if (Platform.OS !== "ios") return;
  await saveStepUpPassword(userId, password);
}

export async function clearSavedStepUpPassword(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(OWNER_KEY, OWNER_OPTIONS).catch(() => undefined),
    SecureStore.deleteItemAsync(PASSWORD_KEY, { keychainService: KEYCHAIN_SERVICE }).catch(
      () => undefined,
    ),
  ]);
}
