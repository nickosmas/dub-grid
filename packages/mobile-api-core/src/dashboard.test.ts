import { describe, expect, it, vi } from "vitest";
import type { MobileOpenShift, MobileShiftRequest } from "@dubgrid/contracts";
import { MobileApiAuthorizationError } from "./read";
import {
  buildActivityFeedFromPublishHistory,
  buildHeroSummary,
  computeStaffHoursForPeriod,
  computeTotalRequiredSlots,
  groupOpenShiftsBySection,
  loadMobileDashboardPayload,
  type DashboardCoverageRequirementRow,
  type DashboardPublishHistoryRow,
  type DashboardScheduleCellRow,
  type DashboardShiftCategoryRow,
} from "./dashboard";

function makeOpenShift(overrides: Partial<MobileOpenShift> = {}): MobileOpenShift {
  return {
    id: "shift-1",
    date: "2026-05-11",
    focusAreaId: 1,
    focusAreaName: "ICU",
    needed: 1,
    state: { kind: "worked", segments: [], absenceTypeId: null, customStartTime: null, customEndTime: null, seriesId: null, fromRecurring: false },
    presentation: { label: "D", segments: [] } as unknown as MobileOpenShift["presentation"],
    canVolunteer: true,
    volunteerBlockReason: null,
    ...overrides,
  };
}

describe("groupOpenShiftsBySection", () => {
  it("sums open slots per focus area and sorts by most urgent first", () => {
    const result = groupOpenShiftsBySection([
      makeOpenShift({ focusAreaId: 1, focusAreaName: "ICU", needed: 1 }),
      makeOpenShift({ focusAreaId: 1, focusAreaName: "ICU", needed: 2 }),
      makeOpenShift({ focusAreaId: 2, focusAreaName: "ER", needed: 5 }),
    ]);

    expect(result).toEqual([
      { focusAreaId: 2, focusAreaName: "ER", openSlots: 5 },
      { focusAreaId: 1, focusAreaName: "ICU", openSlots: 3 },
    ]);
  });

  it("falls back to Unassigned for a null focus area name", () => {
    const result = groupOpenShiftsBySection([
      makeOpenShift({ focusAreaId: 9, focusAreaName: null, needed: 1 }),
    ]);

    expect(result[0]?.focusAreaName).toBe("Unassigned");
  });
});

describe("computeStaffHoursForPeriod", () => {
  const shiftCategoriesById = new Map<number, DashboardShiftCategoryRow>([
    [10, { id: 10, start_time: "07:00", end_time: "19:00", break_minutes: null }], // 12h shift
  ]);
  const range = { startDate: "2026-05-11", endDate: "2026-05-17" };

  function makeRow(overrides: Partial<DashboardScheduleCellRow> = {}): DashboardScheduleCellRow {
    return {
      emp_id: "emp-1",
      date: "2026-05-11",
      state: {
        kind: "worked",
        segments: [{ shiftId: 10 }],
        customStartTime: null,
        customEndTime: null,
      },
      employees: { id: "emp-1", first_name: "Alex", last_name: "Rivera" },
      ...overrides,
    };
  }

  it("flags an employee who exceeds the weekly overtime threshold", () => {
    const rows = [
      makeRow({ date: "2026-05-11" }),
      makeRow({ date: "2026-05-12" }),
      makeRow({ date: "2026-05-13" }),
      makeRow({ date: "2026-05-14" }), // 4 x 12h = 48h this week
    ];

    const result = computeStaffHoursForPeriod(rows, shiftCategoriesById, range);

    expect(result).toEqual([
      { employeeId: "emp-1", employeeName: "Alex Rivera", totalHours: 48, overtimeHours: 8 },
    ]);
  });

  it("omits employees who stay under the threshold", () => {
    const rows = [makeRow({ date: "2026-05-11" }), makeRow({ date: "2026-05-12" })]; // 24h

    expect(computeStaffHoursForPeriod(rows, shiftCategoriesById, range)).toEqual([]);
  });

  it("ignores absence and deleted cells", () => {
    const rows = [
      makeRow({ date: "2026-05-11", state: { kind: "absence", segments: [], customStartTime: null, customEndTime: null } }),
    ];

    expect(computeStaffHoursForPeriod(rows, shiftCategoriesById, range)).toEqual([]);
  });

  it("uses a custom time override when present instead of the shift category default", () => {
    const rows = [
      makeRow({
        date: "2026-05-11",
        state: {
          kind: "worked",
          segments: [{ shiftId: 10 }],
          customStartTime: "07:00",
          customEndTime: "15:00", // 8h, not the category's 12h
        },
      }),
      makeRow({ date: "2026-05-12" }), // 12h default
      makeRow({ date: "2026-05-13" }), // 12h default
      makeRow({ date: "2026-05-14" }), // 12h default -> 44h total this week
    ];

    const result = computeStaffHoursForPeriod(rows, shiftCategoriesById, range);
    expect(result).toEqual([
      { employeeId: "emp-1", employeeName: "Alex Rivera", totalHours: 44, overtimeHours: 4 },
    ]);
  });

  it("deducts the shift category's break minutes, matching web's dashboard-stats.ts", () => {
    const categoriesWithBreak = new Map<number, DashboardShiftCategoryRow>([
      [10, { id: 10, start_time: "07:00", end_time: "19:00", break_minutes: 30 }], // 12h - 30m = 11.5h
    ]);
    const rows = [
      makeRow({ date: "2026-05-11" }),
      makeRow({ date: "2026-05-12" }),
      makeRow({ date: "2026-05-13" }),
      makeRow({ date: "2026-05-14" }), // 4 x 11.5h = 46h this week
    ];

    const result = computeStaffHoursForPeriod(rows, categoriesWithBreak, range);

    expect(result).toEqual([
      { employeeId: "emp-1", employeeName: "Alex Rivera", totalHours: 46, overtimeHours: 6 },
    ]);
  });
});

describe("buildActivityFeedFromPublishHistory", () => {
  function makeRow(overrides: Partial<DashboardPublishHistoryRow> = {}): DashboardPublishHistoryRow {
    return {
      published_by: "profile-1",
      start_date: "2026-05-11",
      end_date: "2026-05-17",
      published_at: "2026-05-10T12:00:00.000Z",
      ...overrides,
    };
  }

  it("resolves the publisher name and sorts most recent first", () => {
    const nameByProfileId = new Map([["profile-1", "Jordan Lee"]]);
    const rows = [
      makeRow({ published_at: "2026-05-09T12:00:00.000Z" }),
      makeRow({ published_at: "2026-05-10T12:00:00.000Z" }),
    ];

    const result = buildActivityFeedFromPublishHistory(rows, nameByProfileId);

    expect(result[0]?.description).toBe(
      "Jordan Lee published the schedule for May 11 to May 17",
    );
    expect(result[0]?.timestamp).toBe("2026-05-10T12:00:00.000Z");
  });

  it("falls back to Someone when the publisher name can't be resolved", () => {
    const result = buildActivityFeedFromPublishHistory([makeRow({ published_by: null })], new Map());

    expect(result[0]?.description).toContain("Someone published");
  });
});

describe("computeTotalRequiredSlots", () => {
  it("sums min_staff for requirements matching each day's day-of-week", () => {
    const requirements: DashboardCoverageRequirementRow[] = [
      { focus_area_id: 1, job_id: 1, preferred_shift_id: 10, day_of_week: 1, min_staff: 3 }, // Monday
      { focus_area_id: 2, job_id: 2, preferred_shift_id: 11, day_of_week: null, min_staff: 2 }, // every day
    ];
    // 2026-05-11 is a Monday.
    const dateKeys = ["2026-05-11", "2026-05-12"];

    const total = computeTotalRequiredSlots(requirements, dateKeys);

    // Monday: 3 (day-specific) + 2 (every-day) = 5. Tuesday: only the
    // every-day row applies (no Tuesday-specific row) = 2. Total = 7.
    expect(total).toBe(7);
  });

  it("prefers the day-specific row over the every-day fallback for the same combo", () => {
    const requirements: DashboardCoverageRequirementRow[] = [
      { focus_area_id: 1, job_id: 1, preferred_shift_id: 10, day_of_week: 1, min_staff: 5 },
      { focus_area_id: 1, job_id: 1, preferred_shift_id: 10, day_of_week: null, min_staff: 1 },
    ];

    const total = computeTotalRequiredSlots(requirements, ["2026-05-11"]); // Monday

    expect(total).toBe(5);
  });
});

describe("buildHeroSummary", () => {
  it("prioritizes open coverage gaps", () => {
    const result = buildHeroSummary({
      openGapCount: 2,
      pendingApprovalsCount: 3,
      hasCoverageRequirements: true,
    });

    expect(result.title).toBe("2 coverage gaps");
    expect(result.statusLabel).toBe("Attention");
  });

  it("falls back to pending approvals when there are no gaps", () => {
    const result = buildHeroSummary({
      openGapCount: 0,
      pendingApprovalsCount: 1,
      hasCoverageRequirements: true,
    });

    expect(result.title).toBe("1 request awaiting approval");
  });

  it("flags unconfigured coverage requirements", () => {
    const result = buildHeroSummary({
      openGapCount: 0,
      pendingApprovalsCount: 0,
      hasCoverageRequirements: false,
    });

    expect(result.statusLabel).toBe("Setup");
  });

  it("reports healthy when there is nothing to flag", () => {
    const result = buildHeroSummary({
      openGapCount: 0,
      pendingApprovalsCount: 0,
      hasCoverageRequirements: true,
    });

    expect(result.statusLabel).toBe("Healthy");
  });
});

describe("loadMobileDashboardPayload", () => {
  const range = { startDate: "2026-05-11", endDate: "2026-05-17" };

  function makeDeps() {
    return {
      fetchMobileOpenShifts: vi.fn().mockResolvedValue([]),
      fetchMobileShiftRequests: vi.fn().mockResolvedValue([]),
      fetchMobileOpenShiftContext: vi
        .fn()
        .mockResolvedValue({ shiftCategoryRows: [], coverageRequirementRows: [] }),
      fetchPublishedMobileScheduleRows: vi.fn().mockResolvedValue([]),
      fetchMobilePublishHistoryRows: vi.fn().mockResolvedValue([]),
      fetchProfileNameRowsByIds: vi.fn().mockResolvedValue([]),
    };
  }

  it("rejects a plain user role", async () => {
    const auth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "user",
      serviceClient: {} as never,
    };

    await expect(loadMobileDashboardPayload(auth, range, makeDeps())).rejects.toBeInstanceOf(
      MobileApiAuthorizationError,
    );
  });

  it("fetches pending approvals for both roles but only lists them in actionQueue for admin", async () => {
    const deps = makeDeps();
    const pendingRequest = { id: "req-1", status: "pending_approval" } as unknown as MobileShiftRequest;
    deps.fetchMobileShiftRequests.mockResolvedValue([pendingRequest]);

    const adminAuth = { currentOrg: { id: "org-1" }, effectiveRole: "admin", serviceClient: {} as never };
    const adminPayload = await loadMobileDashboardPayload(adminAuth, range, deps);
    expect(deps.fetchMobileShiftRequests).toHaveBeenCalledTimes(1);
    expect(adminPayload.actionQueue).toEqual([pendingRequest]);
    expect(adminPayload.metrics.pendingApprovalsCount).toBe(1);

    deps.fetchMobileShiftRequests.mockClear();
    const superAdminAuth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "super_admin",
      serviceClient: {} as never,
    };
    const superAdminPayload = await loadMobileDashboardPayload(superAdminAuth, range, deps);
    // super_admin still needs the count for the hero metric, even though the
    // ActionQueueCard list itself stays admin-only.
    expect(deps.fetchMobileShiftRequests).toHaveBeenCalledTimes(1);
    expect(superAdminPayload.actionQueue).toEqual([]);
    expect(superAdminPayload.metrics.pendingApprovalsCount).toBe(1);
  });

  it("computes coveragePct from coverage requirements vs. open gaps", async () => {
    const deps = makeDeps();
    deps.fetchMobileOpenShiftContext.mockResolvedValue({
      shiftCategoryRows: [],
      coverageRequirementRows: [
        { focus_area_id: 1, job_id: 1, preferred_shift_id: 10, day_of_week: null, min_staff: 10 },
      ],
    });
    deps.fetchMobileOpenShifts.mockResolvedValue([
      makeOpenShift({ id: "s1", date: "2026-05-11", focusAreaId: 1, focusAreaName: "ICU", needed: 3 }),
    ]);
    const auth = { currentOrg: { id: "org-1" }, effectiveRole: "admin", serviceClient: {} as never };

    const payload = await loadMobileDashboardPayload(auth, range, deps);

    // 7 days x 10 required = 70 required; 3 open -> (70-3)/70 = 95.7% -> 96%.
    expect(payload.metrics.coveragePct).toBe(96);
    expect(payload.metrics.openGapCount).toBe(3);
  });

  it("reports a null coveragePct when no coverage requirements are configured", async () => {
    const deps = makeDeps();
    const auth = { currentOrg: { id: "org-1" }, effectiveRole: "admin", serviceClient: {} as never };

    const payload = await loadMobileDashboardPayload(auth, range, deps);

    expect(payload.metrics.coveragePct).toBeNull();
    expect(payload.heroSummary.statusLabel).toBe("Setup");
  });
});
