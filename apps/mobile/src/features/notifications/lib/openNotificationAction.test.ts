import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, replace, openURL } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  openURL: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { push, replace },
}));

vi.mock("react-native", () => ({
  Linking: { openURL },
}));

import {
  isNotificationActionSupportedOnMobile,
  openNotificationAction,
  resolveNativeRoute,
} from "./openNotificationAction";

const PERSON = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("resolveNativeRoute", () => {
  it("sends request hrefs to the Requests tab, whichever path the web uses", () => {
    expect(resolveNativeRoute("/schedule?requests=approval")).toEqual({
      pathname: "/(tabs)/requests",
    });
    expect(resolveNativeRoute("/schedule?requests=mine")).toEqual({ pathname: "/(tabs)/requests" });
    expect(resolveNativeRoute("/requests?id=req-1&tab=approval")).toEqual({
      pathname: "/(tabs)/requests",
    });
  });

  it("sends the schedule to the Schedule tab carrying its date", () => {
    expect(resolveNativeRoute("/schedule?date=2026-10-05")).toEqual({
      pathname: "/(tabs)/team",
      params: { date: "2026-10-05" },
    });
    expect(resolveNativeRoute("/schedule")).toEqual({ pathname: "/(tabs)/team" });
    expect(resolveNativeRoute("/schedule?date=Oct%205")).toEqual({ pathname: "/(tabs)/team" });
  });

  it("sends a person to their screen and people to the tab", () => {
    expect(resolveNativeRoute(`/people/${PERSON}`)).toEqual({
      pathname: "/(tabs)/people/[id]",
      params: { id: PERSON },
    });
    expect(resolveNativeRoute("/people")).toEqual({ pathname: "/(tabs)/people" });
    expect(resolveNativeRoute("/people?section=requests")).toEqual({ pathname: "/(tabs)/people" });
    expect(resolveNativeRoute("/people/42")).toEqual({ pathname: "/(tabs)/people" });
  });

  it("sends security alerts to Profile > Security and the rest to Profile", () => {
    expect(resolveNativeRoute("/profile?section=security")).toEqual({
      pathname: "/(tabs)/profile/security",
    });
    expect(resolveNativeRoute("/profile/security")).toEqual({
      pathname: "/(tabs)/profile/security",
    });
    expect(resolveNativeRoute("/profile")).toEqual({ pathname: "/(tabs)/profile" });
  });

  it("keeps the inbox reachable and leaves settings to the web", () => {
    expect(resolveNativeRoute("/alerts")).toEqual({ pathname: "/alerts" });
    expect(resolveNativeRoute("/settings?section=org-billing")).toBeNull();
    expect(resolveNativeRoute("https://dubgrid.com/anything")).toBeNull();
  });
});

describe("openNotificationAction", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    openURL.mockClear();
  });

  it("opens absolute URLs externally", () => {
    openNotificationAction("https://dubgrid.com/settings?section=org-billing");

    expect(openURL).toHaveBeenCalledWith("https://dubgrid.com/settings?section=org-billing");
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes a bare route as a string and a parameterized one as an object", () => {
    openNotificationAction("/people?section=requests");
    expect(push).toHaveBeenCalledWith("/(tabs)/people");

    openNotificationAction("/schedule?date=2026-07-07");
    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/team",
      params: { date: "2026-07-07" },
    });
  });

  it("can replace instead of push, for a forwarding screen", () => {
    openNotificationAction("/profile?section=security", "replace");

    expect(replace).toHaveBeenCalledWith("/(tabs)/profile/security");
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing for a web-only href", () => {
    openNotificationAction("/settings?section=org-billing");

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe("isNotificationActionSupportedOnMobile", () => {
  it("supports absolute URLs and every mapped path", () => {
    expect(isNotificationActionSupportedOnMobile("https://dubgrid.com/anything")).toBe(true);
    for (const href of [
      "/schedule",
      "/schedule?requests=mine",
      "/requests",
      `/people/${PERSON}`,
      "/profile?section=security",
      "/alerts",
    ]) {
      expect(isNotificationActionSupportedOnMobile(href), href).toBe(true);
    }
  });

  it("marks settings and unknown paths as web-only", () => {
    expect(isNotificationActionSupportedOnMobile("/settings?section=org-billing")).toBe(false);
    expect(isNotificationActionSupportedOnMobile("/reports")).toBe(false);
  });
});
