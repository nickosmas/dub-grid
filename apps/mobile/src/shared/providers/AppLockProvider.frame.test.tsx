import { Profiler } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("../lib/auth-reset", () => ({ handleExpiredMobileSession: vi.fn() }));

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn(async () => true),
  isEnrolledAsync: vi.fn(async () => true),
  // Never settles, so the lock stays up for the whole test.
  authenticateAsync: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock("./AuthSessionProvider", () => ({
  useSessionState: () => ({ accessToken: "token-123", isLoading: false }),
}));

let lockState = "loading";
vi.mock("../lib/app-lock", () => ({
  appLockUnsupported: false,
  loadAppLockEnabled: vi.fn(async () => true),
  getAppLockEnabledSnapshot: () => lockState === "enabled",
  getAppLockStateSnapshot: () => lockState,
  appLockRequired: (state: string) => state === "enabled" || state === "unreadable",
  subscribeAppLockEnabled: () => () => {},
  isSettingsDeviceCheckOpen: () => false,
  setAppLockSurface: () => undefined,
  useAppLockSurface: () => ({ engaged: false }),
}));

// Every commit is logged as "was the cover up, and was the lock showing".
// Testing Library flushes effects inside act, so the final DOM cannot show an
// uncovered frame; this log, read from the DOM as each commit lands, can.
const renders: Array<{ cover: boolean; locked: boolean }> = [];
function logCommit() {
  renders.push({
    cover: Boolean(document.querySelector('[data-testid="app-lock-cover"]')),
    locked: Boolean(document.querySelector('[data-testid="app-lock"]')),
  });
}
vi.mock("../components/AppSplashScreen", () => ({ AppSplashScreen: () => null }));
vi.mock("../components/Button", () => ({ Button: () => null }));

import { AppLockProvider } from "./AppLockProvider";

describe("AppLockProvider frames", () => {
  beforeEach(() => {
    renders.length = 0;
    lockState = "loading";
  });

  // The lock used to be set in an effect, so the first render after the
  // setting resolved had neither the loading cover nor the lock (41b3).
  it("never renders content uncovered between loading and locked", () => {
    const { rerender } = render(
      <Profiler id="lock" onRender={logCommit}>
        <AppLockProvider>
          <div>content</div>
        </AppLockProvider>
      </Profiler>,
    );
    expect(renders.at(-1)).toEqual({ cover: true, locked: false });

    lockState = "enabled";
    rerender(
      <Profiler id="lock" onRender={logCommit}>
        <AppLockProvider>
          <div>content</div>
        </AppLockProvider>
      </Profiler>,
    );

    expect(renders.filter((entry) => !entry.cover)).toEqual([]);
    expect(renders.at(-1)).toEqual({ cover: true, locked: true });
  });
});
