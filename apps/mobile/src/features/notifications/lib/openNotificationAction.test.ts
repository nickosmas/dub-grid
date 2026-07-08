import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, openURL } = vi.hoisted(() => ({
  push: vi.fn(),
  openURL: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { push },
}));

vi.mock("react-native", () => ({
  Linking: { openURL },
}));

import {
  isNotificationActionSupportedOnMobile,
  openNotificationAction,
} from "./openNotificationAction";

describe("openNotificationAction", () => {
  beforeEach(() => {
    push.mockClear();
    openURL.mockClear();
  });

  it("opens absolute URLs externally", () => {
    openNotificationAction("https://dubgrid.com/settings?section=org-billing");

    expect(openURL).toHaveBeenCalledWith("https://dubgrid.com/settings?section=org-billing");
    expect(push).not.toHaveBeenCalled();
  });

  it("routes /people hrefs to the People tab, not the Requests tab", () => {
    openNotificationAction("/people?section=requests");

    expect(push).toHaveBeenCalledWith("/(tabs)/people");
  });

  it("routes /requests hrefs to the Requests tab", () => {
    openNotificationAction("/requests?type=pickup");

    expect(push).toHaveBeenCalledWith("/(tabs)/requests");
  });

  it("routes /schedule hrefs to the home tab", () => {
    openNotificationAction("/schedule?date=2026-07-07");

    expect(push).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("routes /profile hrefs to the profile tab", () => {
    openNotificationAction("/profile/security");

    expect(push).toHaveBeenCalledWith("/(tabs)/profile");
  });

  it("does nothing for an unmatched relative href", () => {
    openNotificationAction("/settings?section=org-billing");

    expect(push).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe("isNotificationActionSupportedOnMobile", () => {
  it("supports absolute URLs", () => {
    expect(isNotificationActionSupportedOnMobile("https://dubgrid.com/anything")).toBe(true);
  });

  it("supports known in-app route prefixes", () => {
    expect(isNotificationActionSupportedOnMobile("/people?section=requests")).toBe(true);
    expect(isNotificationActionSupportedOnMobile("/requests?type=pickup")).toBe(true);
    expect(isNotificationActionSupportedOnMobile("/schedule?date=2026-07-07")).toBe(true);
    expect(isNotificationActionSupportedOnMobile("/profile/security")).toBe(true);
  });

  it("rejects hrefs with no known mobile destination, e.g. web-only settings pages", () => {
    expect(isNotificationActionSupportedOnMobile("/settings?section=org-billing")).toBe(false);
    expect(isNotificationActionSupportedOnMobile("/reports/export")).toBe(false);
  });
});
