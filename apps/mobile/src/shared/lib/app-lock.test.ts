import { beforeEach, describe, expect, it, vi } from "vitest";

const getStoredValue = vi.fn();

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./local-storage", () => ({
  getStoredValue: (...args: unknown[]) => getStoredValue(...args),
  setStoredValue: vi.fn(),
}));

async function load() {
  vi.resetModules();
  return import("./app-lock");
}

describe("app-lock setting", () => {
  beforeEach(() => {
    getStoredValue.mockReset();
  });

  it("is loading until the first read settles", async () => {
    const lock = await load();
    expect(lock.getAppLockStateSnapshot()).toBe("loading");
  });

  it("reads the stored value", async () => {
    getStoredValue.mockResolvedValue("1");
    const lock = await load();
    await lock.loadAppLockEnabled();
    expect(lock.getAppLockStateSnapshot()).toBe("enabled");
  });

  it("treats a failed read as requiring the lock", async () => {
    getStoredValue.mockRejectedValue(new Error("keychain unavailable"));
    const lock = await load();
    await lock.loadAppLockEnabled();
    expect(lock.getAppLockStateSnapshot()).toBe("unreadable");
    expect(lock.appLockRequired(lock.getAppLockStateSnapshot())).toBe(true);
  });

  it("treats a read that never settles as requiring the lock", async () => {
    vi.useFakeTimers();
    try {
      getStoredValue.mockReturnValue(new Promise(() => undefined));
      const lock = await load();
      const pending = lock.loadAppLockEnabled();
      await vi.advanceTimersByTimeAsync(5_100);
      await pending;
      expect(lock.getAppLockStateSnapshot()).toBe("unreadable");
    } finally {
      vi.useRealTimers();
    }
  });
});
