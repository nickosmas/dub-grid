import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prefetchQuery, getDashboard, getMySchedule } = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  getDashboard: vi.fn(),
  getMySchedule: vi.fn(),
}));

vi.mock("../../../shared/lib/query-client", () => ({ queryClient: { prefetchQuery } }));
vi.mock("../../../shared/lib/api", () => ({ getDashboard, getMySchedule }));

import { usePrefetchAdjacentDashboardWeeks } from "./usePrefetchAdjacentDashboardWeeks";

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

const WEEK = { startDate: "2026-10-25", endDate: "2026-10-31" };

function rangeOf(key: unknown[]) {
  const [startDate, endDate] = key.slice(-2) as [string, string];
  return { startDate, endDate };
}

describe("usePrefetchAdjacentDashboardWeeks", () => {
  beforeEach(() => {
    prefetchQuery.mockReset();
    prefetchQuery.mockResolvedValue(undefined);
    getDashboard.mockReset();
    getMySchedule.mockReset();
  });

  it("does nothing until bootstrap has landed", () => {
    renderHook(() =>
      usePrefetchAdjacentDashboardWeeks({
        accessToken: token,
        range: WEEK,
        includeSchedule: true,
        ready: false,
        currentUpdatedAt: 0,
      }),
    );

    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("warms the dashboard and schedule for the week before and after", () => {
    renderHook(() =>
      usePrefetchAdjacentDashboardWeeks({
        accessToken: token,
        range: WEEK,
        includeSchedule: true,
        ready: true,
        currentUpdatedAt: 1,
      }),
    );

    const keys = keysOf(prefetchQuery.mock.calls);
    expect(keys).toHaveLength(4);
    expect(keys.map(rangeOf)).toEqual([
      { startDate: "2026-10-18", endDate: "2026-10-24" },
      { startDate: "2026-10-18", endDate: "2026-10-24" },
      { startDate: "2026-11-01", endDate: "2026-11-07" },
      { startDate: "2026-11-01", endDate: "2026-11-07" },
    ]);
    expect(keys[0]).toEqual(expect.arrayContaining(["mobile", "dashboard"]));
    expect(keys[1]).toEqual(expect.arrayContaining(["my-schedule"]));

    // Each prefetch requests exactly its own range.
    const signal = new AbortController().signal;
    (prefetchQuery.mock.calls[2]![0] as { queryFn: (c: unknown) => void }).queryFn({ signal });
    expect(getDashboard).toHaveBeenCalledWith(
      token,
      { startDate: "2026-11-01", endDate: "2026-11-07" },
      signal,
    );
  });

  it("skips the schedule for management-only users", () => {
    renderHook(() =>
      usePrefetchAdjacentDashboardWeeks({
        accessToken: token,
        range: WEEK,
        includeSchedule: false,
        ready: true,
        currentUpdatedAt: 1,
      }),
    );

    expect(keysOf(prefetchQuery.mock.calls)).toHaveLength(2);
  });

  it("re-warms the neighbours each time the shown week refreshes", () => {
    const { rerender } = renderHook(
      ({ updatedAt }: { updatedAt: number }) =>
        usePrefetchAdjacentDashboardWeeks({
          accessToken: token,
          range: WEEK,
          includeSchedule: false,
          ready: true,
          currentUpdatedAt: updatedAt,
        }),
      { initialProps: { updatedAt: 1 } },
    );
    expect(prefetchQuery).toHaveBeenCalledTimes(2);

    rerender({ updatedAt: 1 });
    expect(prefetchQuery).toHaveBeenCalledTimes(2);

    rerender({ updatedAt: 2 });
    expect(prefetchQuery).toHaveBeenCalledTimes(4);
  });
});
