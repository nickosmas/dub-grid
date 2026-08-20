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
  loadLastOrg,
  loadStoredPushDevice,
  saveLastOrg,
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

  it("persists the last organization across logouts", async () => {
    await saveLastOrg({ slug: "DubGrid-Health", name: "DubGrid Health" });

    await expect(loadLastOrg()).resolves.toEqual({
      slug: "dubgrid-health",
      name: "DubGrid Health",
    });
  });

  // Login shows the cached name immediately; without one it can only name the
  // organization by subdomain until a lookup answers.
  it("stores a null name when none is known yet", async () => {
    await saveLastOrg({ slug: "dubgrid-health" });

    await expect(loadLastOrg()).resolves.toEqual({ slug: "dubgrid-health", name: null });
  });

  // Installs that last wrote this key before names were cached hold a bare
  // slug; dropping it would forget the remembered organization on upgrade.
  it("reads a legacy bare-slug record", async () => {
    window.localStorage.setItem("dubgrid-mobile-last-org", "dubgrid-health");

    await expect(loadLastOrg()).resolves.toEqual({ slug: "dubgrid-health", name: null });
  });

  it("forgets the organization when the slug is cleared", async () => {
    await saveLastOrg({ slug: "dubgrid-health", name: "DubGrid Health" });
    await saveLastOrg({ slug: null });

    await expect(loadLastOrg()).resolves.toBeNull();
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
