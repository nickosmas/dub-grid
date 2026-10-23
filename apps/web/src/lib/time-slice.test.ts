import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeSlicer } from "./time-slice";

describe("createTimeSlicer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits a task only once the slice has used its budget", async () => {
    vi.useFakeTimers();
    let clock = 0;
    const pause = createTimeSlicer(12, () => clock);
    const settled = vi.fn();

    clock = 5;
    await pause().then(settled);
    expect(settled).toHaveBeenCalledTimes(1);

    clock = 13;
    const waiting = pause().then(settled);
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await waiting;
    expect(settled).toHaveBeenCalledTimes(2);

    // A new slice starts after the wait.
    clock = 20;
    await pause().then(settled);
    expect(settled).toHaveBeenCalledTimes(3);
  });
});
