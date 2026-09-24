import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const hasHardwareAsync = vi.fn();
const isEnrolledAsync = vi.fn();
const authenticateAsync = vi.fn();

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: (...args: unknown[]) => hasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => isEnrolledAsync(...args),
  authenticateAsync: (...args: unknown[]) => authenticateAsync(...args),
}));

const useSessionState = vi.fn();

vi.mock("./AuthSessionProvider", () => ({
  useSessionState: () => useSessionState(),
}));

let appLockEnabled = false;
const loadAppLockEnabled = vi.fn(async () => appLockEnabled);
const getAppLockEnabledSnapshot = vi.fn(() => appLockEnabled);
const subscribeAppLockEnabled = vi.fn((_callback: () => void) => () => {});
let lockStateOverride: string | null = null;
const getAppLockStateSnapshot = () =>
  lockStateOverride ?? (appLockEnabled ? "enabled" : "disabled");

vi.mock("../lib/app-lock", () => ({
  appLockUnsupported: false,
  loadAppLockEnabled: () => loadAppLockEnabled(),
  getAppLockEnabledSnapshot: () => getAppLockEnabledSnapshot(),
  getAppLockStateSnapshot: () => getAppLockStateSnapshot(),
  appLockRequired: (state: string) => state === "enabled" || state === "unreadable",
  subscribeAppLockEnabled: (callback: () => void) => subscribeAppLockEnabled(callback),
}));
vi.mock("../components/AppSplashScreen", () => ({
  AppSplashScreen: () => <div>splash</div>,
}));

import { AppLockProvider } from "./AppLockProvider";

let appStateListener: ((state: string) => void) | null = null;

describe("AppLockProvider", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    appLockEnabled = false;
    lockStateOverride = null;
    appStateListener = null;
    useSessionState.mockReturnValue({ accessToken: "token-123", isLoading: false });
    hasHardwareAsync.mockResolvedValue(true);
    isEnrolledAsync.mockResolvedValue(true);
    authenticateAsync.mockResolvedValue({ success: true });

    const { AppState } = await import("react-native");
    vi.spyOn(AppState, "addEventListener").mockImplementation(((
      _event: string,
      listener: (state: string) => void,
    ) => {
      appStateListener = listener;
      return { remove: vi.fn() };
    }) as typeof AppState.addEventListener);
  });

  it("renders children without a lock screen when the setting is disabled", async () => {
    appLockEnabled = false;

    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("app-content")).toBeInTheDocument();
    });
    expect(screen.queryByText("App locked")).not.toBeInTheDocument();
  });

  it("locks on mount when enabled and unlocks after successful authentication", async () => {
    appLockEnabled = true;

    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("App locked")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(authenticateAsync).toHaveBeenCalled();
      expect(screen.queryByText("App locked")).not.toBeInTheDocument();
    });
  });

  it("fails open when the device has no biometrics/passcode enrolled", async () => {
    appLockEnabled = true;
    isEnrolledAsync.mockResolvedValue(false);

    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText("App locked")).not.toBeInTheDocument();
    });
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("does not re-prompt when the user cancels the device check", async () => {
    // The loop this guards against: a declined check leaves `locked` true and
    // `authenticating` back to false, which used to re-enter `attemptUnlock`
    // immediately and raise the system prompt again the moment it closed —
    // with the sheet's own Unlock button unreachable underneath it.
    appLockEnabled = true;
    authenticateAsync.mockResolvedValue({ success: false, error: "user_cancel" });

    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(authenticateAsync).toHaveBeenCalledTimes(1);
    });

    // Settle anything the rejection queued, then confirm it stayed at one.
    await act(async () => {
      await Promise.resolve();
    });

    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("App locked")).toBeInTheDocument();
  });

  it("stays locked rather than crashing when the device check throws", async () => {
    // Android rejects `authenticateAsync` when the activity isn't ready, which
    // is exactly when this runs. It used to surface as an unhandled rejection.
    appLockEnabled = true;
    authenticateAsync.mockRejectedValue(new Error("activity not available"));

    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(authenticateAsync).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("App locked")).toBeInTheDocument();
  });

  it("locks again when the app returns from the background", async () => {
    appLockEnabled = true;

    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText("App locked")).not.toBeInTheDocument();
    });

    authenticateAsync.mockClear();

    act(() => {
      appStateListener?.("background");
    });

    await waitFor(() => {
      expect(screen.getByText("App locked")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(authenticateAsync).toHaveBeenCalled();
      expect(screen.queryByText("App locked")).not.toBeInTheDocument();
    });
  });

  it("keeps the app covered until the stored setting has loaded", async () => {
    lockStateOverride = "loading";
    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    expect(screen.getByTestId("app-lock-hydrating")).toBeInTheDocument();
    expect(screen.queryByText("App locked")).not.toBeInTheDocument();
  });

  it("locks when the stored setting cannot be read", async () => {
    lockStateOverride = "unreadable";
    render(
      <AppLockProvider>
        <div data-testid="app-content">content</div>
      </AppLockProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("App locked")).toBeInTheDocument();
    });
  });
});
