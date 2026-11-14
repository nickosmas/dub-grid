import { ApiResponseError } from "@dubgrid/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  canUseBiometricAuthentication: vi.fn(),
}));
const lock = vi.hoisted(() => ({ enabled: true, unsupported: false }));
const platform = vi.hoisted(() => ({ OS: "ios" }));

vi.mock("react-native", () => ({ Platform: platform }));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  getItemAsync: store.getItemAsync,
  setItemAsync: store.setItemAsync,
  deleteItemAsync: store.deleteItemAsync,
  canUseBiometricAuthentication: store.canUseBiometricAuthentication,
}));
vi.mock("./app-lock", () => ({
  get appLockUnsupported() {
    return lock.unsupported;
  },
  getAppLockEnabledSnapshot: () => lock.enabled,
  withDeviceCheckOpen: <T>(check: () => Promise<T>) => check(),
}));

import {
  clearSavedStepUpPassword,
  isRefusedSavedPassword,
  readSavedStepUpPassword,
  rememberSignInPassword,
  saveStepUpPassword,
  shouldUseBiometricStepUp,
} from "./biometric-step-up";

beforeEach(() => {
  vi.clearAllMocks();
  store.values.clear();
  lock.enabled = true;
  lock.unsupported = false;
  platform.OS = "ios";
  store.getItemAsync.mockImplementation(async (key: string) => store.values.get(key) ?? null);
  store.setItemAsync.mockImplementation(async (key: string, value: string) => {
    store.values.set(key, value);
  });
  store.deleteItemAsync.mockImplementation(async (key: string) => {
    store.values.delete(key);
  });
  store.canUseBiometricAuthentication.mockReturnValue(true);
});

const base = {
  method: "password" as const,
  appLockEnabled: true,
  unsupported: false,
  userId: "user-1",
  savedOwner: "user-1",
};

describe("shouldUseBiometricStepUp", () => {
  it("uses biometrics for a password check with biometric unlock on and this user's copy", () => {
    expect(shouldUseBiometricStepUp(base)).toBe(true);
  });

  it.each([
    ["a two-factor code", { method: "totp" as const }],
    ["biometric unlock off", { appLockEnabled: false }],
    ["a platform without it", { unsupported: true }],
    ["no saved copy", { savedOwner: null }],
    ["another user's copy", { savedOwner: "user-2" }],
    ["an unreadable session", { userId: null, savedOwner: null }],
  ])("asks for the password with %s", (_label, change) => {
    expect(shouldUseBiometricStepUp({ ...base, ...change })).toBe(false);
  });
});

describe("isRefusedSavedPassword", () => {
  it("treats the password check's plain refusal as a wrong password", () => {
    expect(isRefusedSavedPassword(new ApiResponseError("no", 403, { error: "x" }))).toBe(true);
  });

  it("keeps the copy for a two-factor demand, a rate limit or a network failure", () => {
    expect(
      isRefusedSavedPassword(
        new ApiResponseError("no", 403, { code: "STEP_UP_REQUIRED", method: "totp" }),
      ),
    ).toBe(false);
    expect(isRefusedSavedPassword(new ApiResponseError("slow", 429, {}))).toBe(false);
    expect(isRefusedSavedPassword(new Error("Network request failed"))).toBe(false);
  });
});

describe("saved password", () => {
  it("saves behind biometrics and reads it back for the same user", async () => {
    await saveStepUpPassword("user-1", "secret");

    expect(store.setItemAsync).toHaveBeenCalledWith(
      "dg_step_up_password",
      "secret",
      expect.objectContaining({ requireAuthentication: true, keychainService: "dg_step_up" }),
    );
    await expect(readSavedStepUpPassword("password", "user-1")).resolves.toBe("secret");
    expect(store.getItemAsync).toHaveBeenCalledWith(
      "dg_step_up_password",
      expect.objectContaining({ requireAuthentication: true }),
    );
  });

  it("deletes the old copy before saving, so iOS never asks to update it", async () => {
    await saveStepUpPassword("user-1", "secret");
    const deleteOrder = store.deleteItemAsync.mock.invocationCallOrder[0];
    const setOrder = store.setItemAsync.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(setOrder);
  });

  it("saves nothing while biometric unlock is off or biometrics can't be used", async () => {
    lock.enabled = false;
    await saveStepUpPassword("user-1", "secret");
    lock.enabled = true;
    store.canUseBiometricAuthentication.mockReturnValue(false);
    await saveStepUpPassword("user-1", "secret");

    expect(store.setItemAsync).not.toHaveBeenCalled();
  });

  it("leaves no owner behind when the biometric save is cancelled", async () => {
    store.setItemAsync.mockRejectedValueOnce(new Error("User canceled"));
    await saveStepUpPassword("user-1", "secret");

    expect(store.values.size).toBe(0);
  });

  it("never prompts for a two-factor check or with biometric unlock off", async () => {
    await saveStepUpPassword("user-1", "secret");
    store.getItemAsync.mockClear();

    await expect(readSavedStepUpPassword("totp", "user-1")).resolves.toBeNull();
    lock.enabled = false;
    await expect(readSavedStepUpPassword("password", "user-1")).resolves.toBeNull();
    expect(store.getItemAsync).not.toHaveBeenCalledWith("dg_step_up_password", expect.anything());
  });

  it("deletes another user's copy without prompting", async () => {
    await saveStepUpPassword("user-1", "secret");

    await expect(readSavedStepUpPassword("password", "user-2")).resolves.toBeNull();
    expect(store.values.size).toBe(0);
    expect(store.getItemAsync).not.toHaveBeenCalledWith("dg_step_up_password", expect.anything());
  });

  it("returns null and keeps the copy when the prompt is cancelled", async () => {
    await saveStepUpPassword("user-1", "secret");
    store.getItemAsync.mockImplementation(async (key: string) => {
      if (key === "dg_step_up_password") throw new Error("User canceled the operation");
      return store.values.get(key) ?? null;
    });

    await expect(readSavedStepUpPassword("password", "user-1")).resolves.toBeNull();
    expect(store.values.get("dg_step_up_password")).toBe("secret");
  });

  it("returns null when a new enrollment invalidated the copy", async () => {
    await saveStepUpPassword("user-1", "secret");
    store.values.delete("dg_step_up_password");

    await expect(readSavedStepUpPassword("password", "user-1")).resolves.toBeNull();
  });

  it("clears both entries", async () => {
    await saveStepUpPassword("user-1", "secret");
    await clearSavedStepUpPassword();

    expect(store.values.size).toBe(0);
  });
});

describe("rememberSignInPassword", () => {
  it("keeps the sign-in password for Face ID on an iPhone with app lock on", async () => {
    await rememberSignInPassword("user-1", "correct horse");

    expect(store.values.get("dg_step_up_password")).toBe("correct horse");
    expect(store.values.get("dg_step_up_password_owner")).toBe("user-1");
  });

  it("keeps nothing on Android, which would ask for a fingerprint at sign-in", async () => {
    platform.OS = "android";

    await rememberSignInPassword("user-1", "correct horse");

    expect(store.setItemAsync).not.toHaveBeenCalled();
  });

  it("keeps nothing while app lock is off", async () => {
    lock.enabled = false;

    await rememberSignInPassword("user-1", "correct horse");

    expect(store.setItemAsync).not.toHaveBeenCalled();
  });
});
