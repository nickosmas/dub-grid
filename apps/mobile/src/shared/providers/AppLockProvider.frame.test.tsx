import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

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
}));

// Every commit is logged as "was the loading cover up, and was the lock
// visible". Testing Library flushes effects inside act, so the final DOM
// cannot show an uncovered frame; this log can.
const renders: Array<{ cover: boolean; locked: boolean }> = [];
let coverThisRender = false;
vi.mock("../components/AppSplashScreen", () => ({
  AppSplashScreen: () => {
    coverThisRender = true;
    return null;
  },
}));
vi.mock("../components/BottomSheetModal", () => ({
  BottomSheetModal: ({ visible }: { visible: boolean }) => {
    renders.push({ cover: coverThisRender, locked: visible });
    coverThisRender = false;
    return null;
  },
  SheetActions: () => null,
  SheetCopy: () => null,
  SheetHeader: () => null,
}));
vi.mock("../components/Button", () => ({ Button: () => null }));

import { AppLockProvider } from "./AppLockProvider";

describe("AppLockProvider frames", () => {
  beforeEach(() => {
    renders.length = 0;
    coverThisRender = false;
    lockState = "loading";
  });

  // The lock used to be set in an effect, so the first render after the
  // setting resolved had neither the loading cover nor the lock (41b3).
  it("never renders content uncovered between loading and locked", () => {
    const { rerender } = render(
      <AppLockProvider>
        <div>content</div>
      </AppLockProvider>,
    );
    expect(renders.at(-1)).toEqual({ cover: true, locked: false });

    lockState = "enabled";
    rerender(
      <AppLockProvider>
        <div>content</div>
      </AppLockProvider>,
    );

    // The cover also stays under the lock, since the lock is a native modal
    // that fades in over whatever is already on screen.
    expect(renders.filter((entry) => !entry.cover)).toEqual([]);
    expect(renders.at(-1)).toEqual({ cover: true, locked: true });
  });
});
