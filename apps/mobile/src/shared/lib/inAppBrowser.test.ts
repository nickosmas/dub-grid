import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

import { openedUrls } from "../../test/shims/expo-web-browser";
import { openInAppBrowser } from "./inAppBrowser";
import { mobileColors } from "../theme/tokens";

describe("openInAppBrowser", () => {
  beforeEach(() => {
    openedUrls.length = 0;
  });

  it("opens in the in-app browser, themed to match the app", async () => {
    await openInAppBrowser("https://dubgrid.test/privacy", mobileColors);

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0].url).toBe("https://dubgrid.test/privacy");
    // The system default is a light toolbar, which looks broken in dark mode.
    expect(openedUrls[0].options).toMatchObject({
      controlsColor: mobileColors.brand,
      toolbarColor: mobileColors.surface,
    });
  });

  // Better to hand the page to Safari than to swallow the tap entirely.
  it("falls back to the OS handler when the in-app browser won't open", async () => {
    const webBrowser = await import("expo-web-browser");
    const openBrowserAsync = vi
      .spyOn(webBrowser, "openBrowserAsync")
      .mockRejectedValue(new Error("no browser"));
    const { Linking } = await import("react-native");
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);

    await openInAppBrowser("https://dubgrid.test/terms", mobileColors);

    expect(openURL).toHaveBeenCalledWith("https://dubgrid.test/terms");
    openBrowserAsync.mockRestore();
    openURL.mockRestore();
  });
});
