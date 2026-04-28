import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { useManualRefresh } from "./useManualRefresh";

function createDeferredPromise() {
  let resolve: () => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = () => resolvePromise();
    reject = (error?: unknown) => rejectPromise(error);
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe("useManualRefresh", () => {
  it("only shows a refresh state for manual refresh work", async () => {
    const deferred = createDeferredPromise();
    const onRefresh = vi.fn(() => deferred.promise);
    const { result } = renderHook(() => useManualRefresh(onRefresh));

    act(() => {
      result.current.refresh();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(true);

    act(() => {
      result.current.refresh();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    deferred.resolve();

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false);
    });
  });

  it("clears the refresh state after a failed refresh", async () => {
    const deferred = createDeferredPromise();
    const onRefresh = vi.fn(() => deferred.promise);
    const { result } = renderHook(() => useManualRefresh(onRefresh));

    act(() => {
      result.current.refresh();
    });

    deferred.reject(new Error("Refresh failed"));

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false);
    });
  });
});
