import { describe, expect, it } from "vitest";
import {
  changesPublishedSchedule,
  getOrgRealtimeFlushKeys,
  getOrgRealtimeInvalidationKeys,
} from "@/hooks/useOrgRealtimeInvalidation";
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

  it("leaves the published-only operations report alone for schedule cell changes", () => {
    for (const table of [
      "schedule_cells",
      "schedule_cell_snapshots",
      "schedule_cell_segments",
    ] as const) {
      expect(getOrgRealtimeInvalidationKeys("org-1", table)).toEqual([
        queryKeys.shifts.all("org-1"),
        queryKeys.shiftRequests.all("org-1"),
      ]);
    }
  });
});

describe("changesPublishedSchedule", () => {
  it("counts a published snapshot written by a publish, an approval or a correction", () => {
    expect(
      changesPublishedSchedule("schedule_cell_snapshots", {
        eventType: "UPDATE",
        new: { snapshot_kind: "published" },
      }),
    ).toBe(true);
    expect(
      changesPublishedSchedule("schedule_cell_snapshots", {
        eventType: "INSERT",
        new: { snapshot_kind: "published" },
      }),
    ).toBe(true);
  });

  it("ignores a draft snapshot and every other table", () => {
    expect(
      changesPublishedSchedule("schedule_cell_snapshots", {
        eventType: "UPDATE",
        new: { snapshot_kind: "draft" },
      }),
    ).toBe(false);
    expect(
      changesPublishedSchedule("schedule_cells", {
        eventType: "UPDATE",
        new: { snapshot_kind: "published" },
      }),
    ).toBe(false);
  });

  it("counts a delete, whose payload carries only the id", () => {
    expect(
      changesPublishedSchedule("schedule_cell_snapshots", {
        eventType: "DELETE",
        old: { id: "snap-1" },
      }),
    ).toBe(true);
  });
});

describe("getOrgRealtimeFlushKeys", () => {
  it("lists each key once across the tables one cell save touches", () => {
    expect(
      getOrgRealtimeFlushKeys(
        "org-1",
        ["schedule_cells", "schedule_cell_snapshots", "schedule_cell_segments"],
        false,
      ),
    ).toEqual([queryKeys.shifts.all("org-1"), queryKeys.shiftRequests.all("org-1")]);
  });

  it("adds the operations report when a published snapshot changed", () => {
    expect(getOrgRealtimeFlushKeys("org-1", ["schedule_cell_snapshots"], true)).toEqual([
      queryKeys.shifts.all("org-1"),
      queryKeys.shiftRequests.all("org-1"),
      queryKeys.reports.operationsAll("org-1"),
    ]);
  });
});
