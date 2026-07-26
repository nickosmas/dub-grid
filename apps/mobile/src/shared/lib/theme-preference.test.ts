import { beforeEach, describe, expect, it, vi } from "vitest";

const getStoredValue = vi.fn();
const setStoredValue = vi.fn();

vi.mock("./local-storage", () => ({
  getStoredValue: (...args: unknown[]) => getStoredValue(...args),
  setStoredValue: (...args: unknown[]) => setStoredValue(...args),
}));

import { loadThemePreference, saveThemePreference } from "./theme-preference";

describe("theme-preference", () => {
  beforeEach(() => {
    getStoredValue.mockReset();
    setStoredValue.mockReset();
    setStoredValue.mockResolvedValue(undefined);
  });

  it("saves the preference under the dedicated storage key", async () => {
    await saveThemePreference("dark");

    expect(setStoredValue).toHaveBeenCalledWith("dubgrid-mobile-theme-preference", "dark");
  });

  it.each(["system", "light", "dark"] as const)(
    "loads a valid stored preference (%s) as-is",
    async (preference) => {
      getStoredValue.mockResolvedValue(preference);

      await expect(loadThemePreference()).resolves.toBe(preference);
    },
  );

  it("defaults to system when nothing is stored", async () => {
    getStoredValue.mockResolvedValue(null);

    await expect(loadThemePreference()).resolves.toBe("system");
  });

  it("defaults to system when the stored value is not a recognized preference", async () => {
    getStoredValue.mockResolvedValue("sepia");

    await expect(loadThemePreference()).resolves.toBe("system");
  });
});
