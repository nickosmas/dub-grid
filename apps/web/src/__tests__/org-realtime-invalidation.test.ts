import { describe, expect, it } from "vitest";
import { getOrgRealtimeInvalidationKeys } from "@/hooks/useOrgRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

describe("getOrgRealtimeInvalidationKeys", () => {
  it("invalidates bootstrap and organization detail for org changes", () => {
    expect(getOrgRealtimeInvalidationKeys("org-1", "organizations")).toEqual([
      queryKeys.org.bootstrap(),
      queryKeys.org.detail("org-1"),
      queryKeys.org.billing("org-1"),
    ]);
  });

  it("invalidates billing and org shell caches for subscription changes", () => {
    expect(getOrgRealtimeInvalidationKeys("org-1", "subscriptions")).toEqual([
      queryKeys.org.billing("org-1"),
      queryKeys.org.bootstrap(),
      queryKeys.org.detail("org-1"),
    ]);
  });

  it("invalidates settings and derived assignment data for job changes", () => {
    expect(getOrgRealtimeInvalidationKeys("org-1", "jobs")).toEqual([
      queryKeys.org.bootstrap(),
      queryKeys.org.jobs("org-1"),
      queryKeys.org.assignments("org-1"),
      queryKeys.org.coverageRequirements("org-1"),
    ]);
  });

  it("invalidates staff, directory, count, and operations-report caches for employee changes", () => {
    expect(getOrgRealtimeInvalidationKeys("org-1", "employees")).toEqual([
      queryKeys.employees.all("org-1"),
      queryKeys.org.employeeCount("org-1"),
      queryKeys.org.directory("org-1"),
      queryKeys.shiftRequests.all("org-1"),
      queryKeys.reports.operationsAll("org-1"),
    ]);
  });

  it("invalidates request and schedule caches for request changes", () => {
    expect(getOrgRealtimeInvalidationKeys("org-1", "shift_requests")).toEqual([
      queryKeys.shiftRequests.all("org-1"),
      queryKeys.shifts.all("org-1"),
    ]);
  });

  it("invalidates schedule, derived request, and operations-report caches for schedule cell changes", () => {
    expect(getOrgRealtimeInvalidationKeys("org-1", "schedule_cells")).toEqual([
      queryKeys.shifts.all("org-1"),
      queryKeys.shiftRequests.all("org-1"),
      queryKeys.reports.operationsAll("org-1"),
    ]);
  });
});
