import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAsyncAction } from "@/hooks/useAsyncAction";

/** A promise the test settles by hand, standing in for an in-flight request. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  it("runs the action once when pressed twice in the same tick", () => {
    const { promise } = deferred();
    const action = vi.fn(() => promise);
    const { result } = renderHook(() => useAsyncAction(action));

    // Both calls land before React can re-render and disable anything, which
    // is exactly the window a `useState` busy flag leaves open.
    act(() => {
      result.current.run();
      result.current.run();
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("reopens the latch once the action settles", async () => {
    const first = deferred();
    const second = deferred();
    const action = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAsyncAction(action));

    act(() => {
      result.current.run();
    });
    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    expect(result.current.isRunning).toBe(false);

    act(() => {
      result.current.run();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("reopens the latch when the action rejects, and logs rather than swallows", async () => {
    const { promise, reject } = deferred();
    const action = vi.fn(() => promise);
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useAsyncAction(action));

    act(() => {
      result.current.run();
    });

    await act(async () => {
      reject(new Error("save failed"));
      await promise.catch(() => {});
    });

    // The latch must not become an error sink: an uncaught failure still
    // reaches the console, where it landed before the hook wrapped it.
    expect(onError).toHaveBeenCalledWith("An async action failed:", new Error("save failed"));
    onError.mockRestore();

    // A failed save must leave the button pressable again, or the user is
    // stuck with no way to retry.
    expect(result.current.isRunning).toBe(false);

    act(() => {
      result.current.run();
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("stays inert for a synchronous action", () => {
    const action = vi.fn(() => {});
    const { result } = renderHook(() => useAsyncAction(action));

    act(() => {
      result.current.run();
      result.current.run();
    });

    // No promise to wait on, so nothing is latched and nothing re-renders:
    // wrapping a plain click handler must behave exactly as before.
    expect(action).toHaveBeenCalledTimes(2);
    expect(result.current.isRunning).toBe(false);
  });

  it("forwards arguments and calls the latest handler without changing `run`", () => {
    const first = vi.fn(() => {});
    const second = vi.fn(() => {});
    const { result, rerender } = renderHook(({ action }) => useAsyncAction(action), {
      initialProps: { action: first as (...args: unknown[]) => void },
    });

    const runBefore = result.current.run;
    rerender({ action: second as (...args: unknown[]) => void });

    act(() => {
      result.current.run("shift-1");
    });

    expect(result.current.run).toBe(runBefore);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("shift-1");
  });

  it("does not set state after the caller unmounts", async () => {
    const { promise, resolve } = deferred();
    const { result, unmount } = renderHook(() => useAsyncAction(() => promise));

    act(() => {
      result.current.run();
    });
    unmount();

    const onError = vi.fn();
    const previous = console.error;
    console.error = onError;
    await act(async () => {
      resolve();
      await promise;
    });
    console.error = previous;

    expect(onError).not.toHaveBeenCalled();
  });
});
