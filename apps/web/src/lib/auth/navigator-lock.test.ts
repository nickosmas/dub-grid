import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigatorLockAcquireTimeoutError } from "@supabase/supabase-js";
import { authNavigatorLock } from "./navigator-lock";

type Callback = (lock: object | null) => Promise<unknown>;

/** A lock manager whose callbacks are recorded, so a test can check none threw. */
function installLocks(available: boolean) {
  const callbackResults: Promise<unknown>[] = [];
  const request = vi.fn(async (_name: string, _options: unknown, callback: Callback) => {
    const result = callback(available ? {} : null);
    callbackResults.push(result);
    return result;
  });
  vi.stubGlobal("navigator", { locks: { request } });
  return { request, callbackResults };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authNavigatorLock", () => {
  it("reports a lock that isn't free as auth-js's timeout, from outside the callback", async () => {
    const { callbackResults } = installLocks(false);
    const fn = vi.fn();

    const attempt = authNavigatorLock("lock:auth", 0, fn);

    await expect(attempt).rejects.toBeInstanceOf(NavigatorLockAcquireTimeoutError);
    await expect(attempt).rejects.toMatchObject({ isAcquireTimeout: true });
    await expect(Promise.all(callbackResults)).resolves.toEqual([null]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("runs the work when the lock is free", async () => {
    const { request } = installLocks(true);

    await expect(authNavigatorLock("lock:auth", 0, async () => "refreshed")).resolves.toBe(
      "refreshed",
    );
    expect(request).toHaveBeenCalledWith(
      "lock:auth",
      { mode: "exclusive", ifAvailable: true },
      expect.any(Function),
    );
  });

  it("rethrows the work's error after the callback has settled", async () => {
    const { callbackResults } = installLocks(true);
    const failure = new Error("refresh failed");

    await expect(
      authNavigatorLock("lock:auth", 0, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(Promise.all(callbackResults)).resolves.toEqual([{ ok: false, error: failure }]);
  });
});
