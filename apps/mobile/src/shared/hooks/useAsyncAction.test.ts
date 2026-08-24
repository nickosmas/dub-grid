import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useAsyncAction } from "./useAsyncAction";

/** A promise the test settles by hand, standing in for an in-flight request. */
function createDeferredPromise() {
  let resolve: () => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = () => resolvePromise();
    reject = (error?: unknown) => rejectPromise(error);
  });

  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  it("runs the action once when tapped twice in the same tick", () => {
    const deferred = createDeferredPromise();
    const action = vi.fn(() => deferred.promise);
    const { result } = renderHook(() => useAsyncAction(action));

    // Both taps land before React can re-render and disable the pressable,
    // which is exactly the window a `useState` busy flag leaves open.
    act(() => {
      result.current.run();
      result.current.run();
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("reopens the latch once the action settles", async () => {
    const first = createDeferredPromise();
    const second = createDeferredPromise();
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
    const deferred = createDeferredPromise();
    const action = vi.fn(() => deferred.promise);
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useAsyncAction(action));

    act(() => {
      result.current.run();
    });

    await act(async () => {
      deferred.reject(new Error("save failed"));
      await deferred.promise.catch(() => {});
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
    // wrapping a plain press handler must behave exactly as before.
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
});
