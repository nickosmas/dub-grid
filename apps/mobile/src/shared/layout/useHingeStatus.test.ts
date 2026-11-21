import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  status: "unknown",
  remove: vi.fn(),
  emit: (_status: string) => {},
  module: null as unknown,
}));

vi.mock("../../../modules/hinge", () => ({
  get hingeModule() {
    return native.module;
  },
}));

const { HINGE_SETTLE_MS, toHingeStatus, useHingeStatus } = await import("./useHingeStatus");

beforeEach(() => {
  native.status = "unknown";
  native.module = {
    getStatus: () => native.status,
    addListener: (_event: string, next: (change: { status: string }) => void) => {
      native.emit = (status: string) => next({ status });
      return { remove: native.remove };
    },
  };
});

describe("toHingeStatus", () => {
  it("keeps the three statuses UIKit reports", () => {
    expect(toHingeStatus("closed")).toBe("closed");
    expect(toHingeStatus("partiallyOpen")).toBe("partiallyOpen");
    expect(toHingeStatus("fullyOpen")).toBe("fullyOpen");
  });

  it("reads anything else as unknown", () => {
    expect(toHingeStatus("halfway")).toBe("unknown");
    expect(toHingeStatus(undefined)).toBe("unknown");
  });
});

describe("useHingeStatus", () => {
  it("starts from the module's status and follows a change once it holds", () => {
    vi.useFakeTimers();
    native.status = "fullyOpen";
    const { result, unmount } = renderHook(() => useHingeStatus());
    expect(result.current).toBe("fullyOpen");

    act(() => native.emit("partiallyOpen"));
    expect(result.current).toBe("fullyOpen");
    act(() => vi.advanceTimersByTime(HINGE_SETTLE_MS));
    expect(result.current).toBe("partiallyOpen");

    unmount();
    expect(native.remove).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores a position the hinge only passes through", () => {
    vi.useFakeTimers();
    native.status = "partiallyOpen";
    const { result } = renderHook(() => useHingeStatus());

    act(() => native.emit("fullyOpen"));
    act(() => vi.advanceTimersByTime(HINGE_SETTLE_MS / 2));
    act(() => native.emit("partiallyOpen"));
    act(() => vi.advanceTimersByTime(HINGE_SETTLE_MS));
    expect(result.current).toBe("partiallyOpen");
    vi.useRealTimers();
  });

  it("is unknown where the module isn't built in", () => {
    native.module = null;
    const { result } = renderHook(() => useHingeStatus());
    expect(result.current).toBe("unknown");
  });
});
