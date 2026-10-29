import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePersonPeriod } from "../usePersonPeriod";
import { PERSON_PERIOD_STORAGE_KEY } from "@/lib/person-period";

describe("usePersonPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 12));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts on the current week", () => {
    const { result } = renderHook(() => usePersonPeriod(null));
    expect(result.current.period).toEqual({
      preset: "current-week",
      range: { startDate: "2026-10-25", endDate: "2026-10-31" },
    });
  });

  it("remembers a choice for the next visit", () => {
    const { result } = renderHook(() => usePersonPeriod(null));
    act(() => result.current.setCustomRange({ startDate: "2026-09-01", endDate: "2026-10-15" }));
    const { result: next } = renderHook(() => usePersonPeriod(null));
    expect(next.current.period).toEqual({
      preset: "custom",
      range: { startDate: "2026-09-01", endDate: "2026-10-15" },
    });
  });

  it("works for the visit when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => usePersonPeriod("2026-10-04"));
    expect(result.current.period.preset).toBe("current-week");
    act(() => result.current.setPreset("pay-period"));
    expect(result.current.period).toEqual({
      preset: "pay-period",
      range: { startDate: "2026-10-18", endDate: "2026-10-31" },
    });
  });

  it("starts Custom on the dates already shown", () => {
    const { result } = renderHook(() => usePersonPeriod("2026-10-04"));
    act(() => result.current.setPreset("pay-period"));
    act(() => result.current.setPreset("custom"));
    expect(result.current.period).toEqual({
      preset: "custom",
      range: { startDate: "2026-10-18", endDate: "2026-10-31" },
    });
  });

  it("ignores a stored value it can't read", () => {
    window.localStorage.setItem(PERSON_PERIOD_STORAGE_KEY, "{broken");
    const { result } = renderHook(() => usePersonPeriod(null));
    expect(result.current.period.preset).toBe("current-week");
  });
});
