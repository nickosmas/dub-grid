import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prefetchQuery, getDashboard, getMySchedule } = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  getDashboard: vi.fn(),
  getMySchedule: vi.fn(),
}));

vi.mock("../../../shared/lib/query-client", () => ({ queryClient: { prefetchQuery } }));
vi.mock("../../../shared/lib/api", () => ({ getDashboard, getMySchedule }));

import { usePrefetchOtherDashboardPeriod } from "./usePrefetchOtherDashboardPeriod";

function tokenFor(issuedAt: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: "user-1", org_id: "org-1", iat: issuedAt }),
    "signature",
  ].join(".");
}

const token = tokenFor("now");

function keysOf(calls: unknown[][]): unknown[][] {
  return calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
}

describe("usePrefetchOtherDashboardPeriod", () => {
  beforeEach(() => {
    prefetchQuery.mockReset();
    prefetchQuery.mockResolvedValue(undefined);
    getDashboard.mockReset();
    getMySchedule.mockReset();
  });

  it("does nothing until the current period has landed", () => {
    renderHook(() =>
      usePrefetchOtherDashboardPeriod({
        accessToken: token,
        periodMode: "week",
        payPeriodStartDate: null,
        includeSchedule: true,
        ready: false,
        currentUpdatedAt: 0,
      }),
    );

    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("warms the two-week dashboard and schedule while on Week", () => {
    renderHook(() =>
      usePrefetchOtherDashboardPeriod({
        accessToken: token,
        periodMode: "week",
        payPeriodStartDate: null,
        includeSchedule: true,
        ready: true,
        currentUpdatedAt: 1,
      }),
    );

    const keys = keysOf(prefetchQuery.mock.calls);
    expect(keys).toHaveLength(2);
    // A 14-day range on both keys: the other period, not this one.
    for (const key of keys) {
      const [startDate, endDate] = key.slice(-2) as [string, string];
      const days =
        (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) /
          (24 * 60 * 60 * 1000) +
        1;
      expect(days).toBe(14);
    }
    expect(keys[0]).toEqual(expect.arrayContaining(["mobile", "dashboard"]));
    expect(keys[1]).toEqual(expect.arrayContaining(["my-schedule"]));

    // Each prefetch requests exactly its own range.
    const signal = new AbortController().signal;
    (prefetchQuery.mock.calls[0]![0] as { queryFn: (c: unknown) => void }).queryFn({ signal });
    expect(getDashboard).toHaveBeenCalledWith(
      token,
      { startDate: keys[0]![keys[0]!.length - 2], endDate: keys[0]![keys[0]!.length - 1] },
      signal,
    );
  });

  it("warms one week while on 2 Weeks, and skips the schedule for management-only users", () => {
    renderHook(() =>
      usePrefetchOtherDashboardPeriod({
        accessToken: token,
        periodMode: "2weeks",
        payPeriodStartDate: null,
        includeSchedule: false,
        ready: true,
        currentUpdatedAt: 1,
      }),
    );

    const keys = keysOf(prefetchQuery.mock.calls);
    expect(keys).toHaveLength(1);
    const [startDate, endDate] = keys[0]!.slice(-2) as [string, string];
    const days =
      (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) /
        (24 * 60 * 60 * 1000) +
      1;
    expect(days).toBe(7);
  });

  it("re-warms the other period each time the current one refreshes", () => {
    const { rerender } = renderHook(
      ({ updatedAt }: { updatedAt: number }) =>
        usePrefetchOtherDashboardPeriod({
          accessToken: token,
          periodMode: "week",
          payPeriodStartDate: null,
          includeSchedule: false,
          ready: true,
          currentUpdatedAt: updatedAt,
        }),
      { initialProps: { updatedAt: 1 } },
    );
    expect(prefetchQuery).toHaveBeenCalledTimes(1);

    rerender({ updatedAt: 1 });
    expect(prefetchQuery).toHaveBeenCalledTimes(1);

    rerender({ updatedAt: 2 });
    expect(prefetchQuery).toHaveBeenCalledTimes(2);
  });
});
