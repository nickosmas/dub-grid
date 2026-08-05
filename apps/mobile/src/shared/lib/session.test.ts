import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: {
    OS: "web",
  },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import {
  loadLastOrgSlug,
  loadStoredPushDevice,
  saveLastOrgSlug,
  saveStoredPushDevice,
  secureStoreAdapter,
} from "./session";

describe("session storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses localStorage for the auth adapter on web", async () => {
    await secureStoreAdapter.setItem("token", "abc123");

    await expect(secureStoreAdapter.getItem("token")).resolves.toBe("abc123");

    await secureStoreAdapter.removeItem("token");

    await expect(secureStoreAdapter.getItem("token")).resolves.toBeNull();
  });

  it("persists the last organization slug across logouts", async () => {
    await saveLastOrgSlug("DubGrid-Health");

    await expect(loadLastOrgSlug()).resolves.toBe("dubgrid-health");
  });

  it("persists the active push device on web", async () => {
    await saveStoredPushDevice({
      expoPushToken: "ExponentPushToken[test-token]",
      platform: "ios",
    });

    await expect(loadStoredPushDevice()).resolves.toEqual({
      expoPushToken: "ExponentPushToken[test-token]",
      platform: "ios",
    });
  });

  it("discards a corrupt stored value instead of throwing", async () => {
    window.localStorage.setItem("dubgrid-mobile-push-device", "{invalid");

    await expect(loadStoredPushDevice()).resolves.toBeNull();
    expect(window.localStorage.getItem("dubgrid-mobile-push-device")).toBeNull();
  });
});
