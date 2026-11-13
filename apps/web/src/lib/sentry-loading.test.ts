import { afterEach, describe, expect, it, vi } from "vitest";
import { bufferEarlyErrors, whenPageSettled } from "./sentry";

describe("whenPageSettled", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for the page's load event before scheduling", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const run = vi.fn();

    whenPageSettled(run);
    vi.advanceTimersByTime(5_000);
    expect(run).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("uses the idle callback when the browser has one", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    const idle = vi.fn((callback: () => void) => callback());
    vi.stubGlobal("requestIdleCallback", idle);
    const run = vi.fn();

    whenPageSettled(run);

    expect(idle).toHaveBeenCalledWith(run, { timeout: 3_000 });
    expect(run).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("bufferEarlyErrors", () => {
  it("listens for uncaught errors and rejections until stopped", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");

    const stop = bufferEarlyErrors();
    const added = add.mock.calls.map(([type]) => type);
    expect(added).toEqual(expect.arrayContaining(["error", "unhandledrejection"]));

    stop();
    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(["error", "unhandledrejection"]));
    add.mockRestore();
    remove.mockRestore();
  });

  it("stops cleanly after the global window is gone", () => {
    const stop = bufferEarlyErrors();
    vi.stubGlobal("window", undefined);
    try {
      expect(() => stop()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
