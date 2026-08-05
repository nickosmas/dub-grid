import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `pushUnsupported` is computed at module scope from these two, and the shared
// expo-constants shim reports Expo Go (where push is unsupported) so that every
// other suite short-circuits. Override it here to exercise the real path.
vi.mock("expo-constants", () => ({
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
  default: { executionEnvironment: "standalone" },
}));

const addEventListener = vi.fn();

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    addEventListener: (...args: unknown[]) => addEventListener(...args),
  },
}));

const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();
const getExpoPushTokenAsync = vi.fn();

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => getPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => requestPermissionsAsync(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => getExpoPushTokenAsync(...a),
}));

const registerPushToken = vi.fn();
const loadStoredPushDevice = vi.fn();
const saveStoredPushDevice = vi.fn();

vi.mock("../../../shared/lib/api", () => ({
  registerPushToken: (...a: unknown[]) => registerPushToken(...a),
}));

vi.mock("../../../shared/lib/session", () => ({
  loadStoredPushDevice: (...a: unknown[]) => loadStoredPushDevice(...a),
  saveStoredPushDevice: (...a: unknown[]) => saveStoredPushDevice(...a),
}));

import { usePushRegistration } from "./usePushRegistration";

const GRANTED = { granted: true, canAskAgain: false };
const UNDETERMINED = { granted: false, canAskAgain: true };
const DENIED = { granted: false, canAskAgain: false };

describe("usePushRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addEventListener.mockReturnValue({ remove: vi.fn() });
    getPermissionsAsync.mockResolvedValue(GRANTED);
    requestPermissionsAsync.mockResolvedValue(GRANTED);
    getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[fresh]" });
    loadStoredPushDevice.mockResolvedValue(null);
    saveStoredPushDevice.mockResolvedValue(undefined);
    registerPushToken.mockResolvedValue({ ok: true });
  });

  it("registers the device once signed in with an org", async () => {
    renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => {
      expect(registerPushToken).toHaveBeenCalledWith("token-123", {
        expoPushToken: "ExponentPushToken[fresh]",
        platform: "ios",
      });
    });
    expect(saveStoredPushDevice).toHaveBeenCalled();
  });

  it("does nothing without an access token or an org", async () => {
    renderHook(() => usePushRegistration(null, "org-1"));
    renderHook(() => usePushRegistration("token-123", null));

    await Promise.resolve();
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  // Minting a token is a native round-trip; the stored one is stable per
  // install, so re-registering must not ask for a new one every launch.
  it("reuses the stored device token instead of minting a new one", async () => {
    loadStoredPushDevice.mockResolvedValue({
      expoPushToken: "ExponentPushToken[stored]",
      platform: "ios",
    });

    renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => {
      expect(registerPushToken).toHaveBeenCalledWith("token-123", {
        expoPushToken: "ExponentPushToken[stored]",
        platform: "ios",
      });
    });
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("does not register when the user refuses the permission prompt", async () => {
    getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    requestPermissionsAsync.mockResolvedValue(DENIED);

    const { result } = renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => {
      expect(result.current.permissionState).toBe("denied");
    });
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it("revokes the stored device when push is disabled", async () => {
    loadStoredPushDevice.mockResolvedValue({
      expoPushToken: "ExponentPushToken[stored]",
      platform: "ios",
    });

    const { result } = renderHook(() =>
      usePushRegistration("token-123", "org-1", { autoRegister: false }),
    );

    await act(async () => {
      await result.current.disablePush();
    });

    expect(registerPushToken).toHaveBeenCalledWith("token-123", {
      expoPushToken: "ExponentPushToken[stored]",
      platform: "ios",
      disabled: true,
    });
  });

  it("keeps the registration fresh when the app returns to the foreground", async () => {
    renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => expect(registerPushToken).toHaveBeenCalledTimes(1));

    const handler = addEventListener.mock.calls.at(-1)?.[1] as (s: string) => void;
    await act(async () => {
      handler("active");
    });

    await waitFor(() => expect(registerPushToken).toHaveBeenCalledTimes(2));
  });

  it("surfaces a registration failure instead of throwing", async () => {
    registerPushToken.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    expect(result.current.isRegistering).toBe(false);
  });
});
