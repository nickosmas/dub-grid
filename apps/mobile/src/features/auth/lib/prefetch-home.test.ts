import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileBootstrapResponse } from "@dubgrid/contracts";
import { getIsoDateInTimeZone, getScheduleRangeForDate } from "@dubgrid/schedule-core";

const getDashboard = vi.fn();
const getMySchedule = vi.fn();
const getShiftRequests = vi.fn();
const prefetchQuery = vi.fn();

vi.mock("../../../shared/lib/api", () => ({
  getDashboard: (...a: unknown[]) => getDashboard(...a),
  getMySchedule: (...a: unknown[]) => getMySchedule(...a),
  getShiftRequests: (...a: unknown[]) => getShiftRequests(...a),
}));
vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: { prefetchQuery: (...a: unknown[]) => prefetchQuery(...a) },
}));
vi.mock("../hooks/useTabsGate", () => ({
  isAdminHomeRole: (role: string | undefined) => role === "admin" || role === "super_admin",
}));

import { getDashboardPeriodRange } from "../../../shared/lib/dates";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { getAdminDashboardQueryKey } from "../../dashboard/hooks/useAdminDashboard";
import { prefetchHomeQueries } from "./prefetch-home";

const TOKEN = "token-1";

function bootstrapFor(
  effectiveRole: string,
  linkedEmployee: { focusAreaIds: string[]; departmentIds: string[] } | null = {
    focusAreaIds: ["fa-1"],
    departmentIds: [],
  },
) {
  return {
    effectiveRole,
    linkedEmployee,
    currentOrg: { timezone: "America/New_York", payPeriodStartDate: null },
  } as unknown as MobileBootstrapResponse;
}

const prefetchedKeys = () =>
  prefetchQuery.mock.calls.map(([options]) => JSON.stringify(options.queryKey));

describe("prefetchHomeQueries", () => {
  beforeEach(() => {
    prefetchQuery.mockReset();
  });

  it("warms an admin's dashboard and own schedule for this week", () => {
    prefetchHomeQueries(TOKEN, bootstrapFor("admin"));

    const range = getDashboardPeriodRange("week", new Date(), null);
    expect(prefetchedKeys()).toEqual([
      JSON.stringify(getAdminDashboardQueryKey(TOKEN, range)),
      JSON.stringify(mobileQueryKeys.dashboardSchedule(TOKEN, range)),
    ]);
  });

  it("warms a staff member's week of shifts and requests in the org's time zone", () => {
    prefetchHomeQueries(TOKEN, bootstrapFor("user"));

    const range = getScheduleRangeForDate(getIsoDateInTimeZone(new Date(), "America/New_York"));
    expect(prefetchedKeys()).toEqual([
      JSON.stringify(mobileQueryKeys.schedule(TOKEN, "mine", range)),
      JSON.stringify(mobileQueryKeys.shiftRequests(TOKEN, range)),
    ]);
  });

  it("warms nothing before bootstrap has landed", () => {
    prefetchHomeQueries(TOKEN, undefined);

    expect(prefetchQuery).not.toHaveBeenCalled();
  });
});
