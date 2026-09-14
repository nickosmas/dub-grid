import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_BOUNDARY_STORAGE_KEY,
  broadcastBrowserSignOut,
  listenForBrowserSignOut,
} from "./auth-boundary-broadcast";

describe("auth boundary broadcast", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("falls back to a cross-tab storage event when BroadcastChannel is unavailable", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error simulate an older browser
    delete globalThis.BroadcastChannel;

    try {
      vi.spyOn(Date, "now").mockReturnValue(1234);
      broadcastBrowserSignOut();
      expect(localStorage.getItem(AUTH_BOUNDARY_STORAGE_KEY)).toBe(
        JSON.stringify({ type: "signed-out", at: 1234 }),
      );

      const onSignOut = vi.fn();
      const unlisten = listenForBrowserSignOut(onSignOut);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUTH_BOUNDARY_STORAGE_KEY,
          newValue: JSON.stringify({ type: "signed-out", at: 1234 }),
        }),
      );
      expect(onSignOut).toHaveBeenCalledOnce();
      unlisten();
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  it("ignores malformed and unrelated storage events", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error simulate an older browser
    delete globalThis.BroadcastChannel;

    try {
      const onSignOut = vi.fn();
      const unlisten = listenForBrowserSignOut(onSignOut);
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "{}" }));
      window.dispatchEvent(
        new StorageEvent("storage", { key: AUTH_BOUNDARY_STORAGE_KEY, newValue: "not-json" }),
      );
      expect(onSignOut).not.toHaveBeenCalled();
      unlisten();
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});
