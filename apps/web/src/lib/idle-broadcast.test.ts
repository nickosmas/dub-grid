import { afterEach, describe, expect, it } from "vitest";
import { broadcastIdleActivity, listenForIdleActivity, STORAGE_KEY } from "./idle-broadcast";

// The BroadcastChannel path itself isn't unit-tested here: jsdom's Event/
// MessageEvent globals are a different class hierarchy than Node's native
// BroadcastChannel implementation uses internally, so cross-instance message
// delivery throws in this test environment (a jsdom/Node interop issue, not
// a bug in this module — mirrors why the existing cache-broadcast.ts has no
// unit tests either). Real cross-tab delivery is covered by manual browser
// verification. The localStorage/storage-event fallback below has no such
// environment quirk and is fully unit-testable.
describe("idle-broadcast", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("falls back to localStorage + storage events when BroadcastChannel is unavailable", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error simulate an environment without BroadcastChannel
    delete globalThis.BroadcastChannel;

    try {
      broadcastIdleActivity(999);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("999");

      const received: number[] = [];
      const unlisten = listenForIdleActivity((at) => received.push(at));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "555" }));

      expect(received).toEqual([555]);
      unlisten();
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  it("ignores storage events for unrelated keys", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error simulate an environment without BroadcastChannel
    delete globalThis.BroadcastChannel;

    try {
      const received: number[] = [];
      const unlisten = listenForIdleActivity((at) => received.push(at));
      window.dispatchEvent(new StorageEvent("storage", { key: "some-other-key", newValue: "555" }));

      expect(received).toEqual([]);
      unlisten();
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});
