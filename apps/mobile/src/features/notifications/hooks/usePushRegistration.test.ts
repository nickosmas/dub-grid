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
  default: {
    executionEnvironment: "standalone",
    expoConfig: { extra: { eas: { projectId: "11111111-2222-4333-8444-555555555555" } } },
  },
}));

const addEventListener = vi.fn();

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    addEventListener: (...args: unknown[]) => addEventListener(...args),
  },
}));

// A real device: the simulator counts as unsupported for push.
vi.mock("expo-device", () => ({ isDevice: true }));

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
let storedRegistration: { key: string; registeredAt: number } | null = null;
const saveStoredPushRegistration = vi.fn(
  async (value: { key: string; registeredAt: number } | null) => {
    storedRegistration = value;
  },
);

vi.mock("../../../shared/lib/api", () => ({
  registerPushToken: (...a: unknown[]) => registerPushToken(...a),
}));

vi.mock("../../../shared/lib/session", () => ({
  loadStoredPushDevice: (...a: unknown[]) => loadStoredPushDevice(...a),
  saveStoredPushDevice: (...a: unknown[]) => saveStoredPushDevice(...a),
  loadStoredPushRegistration: async () => storedRegistration,
  saveStoredPushRegistration: (value: { key: string; registeredAt: number } | null) =>
    saveStoredPushRegistration(value),
}));

import {
  PUSH_REGISTRATION_REFRESH_MS,
  isPushRegistrationCurrent,
  usePushRegistration,
} from "./usePushRegistration";

function tokenFor(userId: string, version = "v1") {
  return `header.${btoa(JSON.stringify({ sub: userId, org_id: "org-1" }))}.${version}`;
}

const GRANTED = { granted: true, canAskAgain: false };
const UNDETERMINED = { granted: false, canAskAgain: true };
const DENIED = { granted: false, canAskAgain: false };

describe("usePushRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedRegistration = null;
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

  // A standalone build resolves no project id on its own, so it travels with
  // the request and a build without one fails by name rather than through the
  // library's generic error.
  it("mints the token against the configured Expo project", async () => {
    renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => {
      expect(getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: "11111111-2222-4333-8444-555555555555",
      });
    });
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

  // The first-run tour is where the permission is asked for, with context.
  // Prompting here as well would put the bare system dialog in front of
  // someone who just answered "Not now" on that tour.
  it("never shows the system prompt on its own", async () => {
    getPermissionsAsync.mockResolvedValue(UNDETERMINED);

    const { result } = renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => {
      expect(getPermissionsAsync).toHaveBeenCalled();
    });
    expect(result.current.permissionState).toBe("undetermined");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it("enablePush shows the system prompt and registers on a yes", async () => {
    getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    requestPermissionsAsync.mockResolvedValue(GRANTED);

    const { result } = renderHook(() =>
      usePushRegistration("token-123", "org-1", { autoRegister: false }),
    );

    await act(async () => {
      await result.current.enablePush();
    });

    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permissionState).toBe("granted");
    expect(registerPushToken).toHaveBeenCalledWith("token-123", {
      expoPushToken: "ExponentPushToken[fresh]",
      platform: "ios",
    });
  });

  it("does not register when the user refuses the permission prompt", async () => {
    getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    requestPermissionsAsync.mockResolvedValue(DENIED);

    const { result } = renderHook(() =>
      usePushRegistration("token-123", "org-1", { autoRegister: false }),
    );

    await act(async () => {
      await result.current.enablePush();
    });

    expect(result.current.permissionState).toBe("denied");
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

  it("does not register again on a foreground within a day of the last one", async () => {
    renderHook(() => usePushRegistration("token-123", "org-1"));

    await waitFor(() => expect(registerPushToken).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storedRegistration).not.toBeNull());

    const handler = addEventListener.mock.calls.at(-1)?.[1] as (s: string) => void;
    await act(async () => {
      handler("active");
    });

    await waitFor(() => expect(getPermissionsAsync).toHaveBeenCalledTimes(2));
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });

  it("renews the registration on a foreground once a day has passed", async () => {
    renderHook(() => usePushRegistration("token-123", "org-1"));
    await waitFor(() => expect(storedRegistration).not.toBeNull());
    storedRegistration = {
      key: storedRegistration!.key,
      registeredAt: Date.now() - PUSH_REGISTRATION_REFRESH_MS,
    };

    const handler = addEventListener.mock.calls.at(-1)?.[1] as (s: string) => void;
    await act(async () => {
      handler("active");
    });

    await waitFor(() => expect(registerPushToken).toHaveBeenCalledTimes(2));
  });

  it("registers again for another person on the same device and organization", async () => {
    const { rerender } = renderHook(
      ({ token }: { token: string }) => usePushRegistration(token, "org-1"),
      { initialProps: { token: tokenFor("user-1") } },
    );
    await waitFor(() => expect(registerPushToken).toHaveBeenCalledTimes(1));

    rerender({ token: tokenFor("user-1", "refreshed") });
    rerender({ token: tokenFor("user-2") });

    await waitFor(() => expect(registerPushToken).toHaveBeenCalledTimes(2));
    expect(registerPushToken.mock.calls[1]?.[0]).toBe(tokenFor("user-2"));
  });

  it("forgets the registration when push is turned off", async () => {
    storedRegistration = { key: "k", registeredAt: Date.now() };
    const { result } = renderHook(() =>
      usePushRegistration("token-123", "org-1", { autoRegister: false }),
    );

    await act(async () => {
      await result.current.disablePush();
    });

    expect(storedRegistration).toBeNull();
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

describe("isPushRegistrationCurrent", () => {
  const now = 1_800_000_000_000;

  it("holds for the same key within a day", () => {
    expect(isPushRegistrationCurrent({ key: "k", registeredAt: now - 1_000 }, "k", now)).toBe(true);
  });

  it("lapses for another key, after a day, or for a clock that went backwards", () => {
    expect(isPushRegistrationCurrent({ key: "k", registeredAt: now }, "other", now)).toBe(false);
    expect(
      isPushRegistrationCurrent(
        { key: "k", registeredAt: now - PUSH_REGISTRATION_REFRESH_MS },
        "k",
        now,
      ),
    ).toBe(false);
    expect(isPushRegistrationCurrent({ key: "k", registeredAt: now + 1_000 }, "k", now)).toBe(
      false,
    );
    expect(isPushRegistrationCurrent(null, "k", now)).toBe(false);
  });
});
