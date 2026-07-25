import { describe, expect, it, vi } from "vitest";
import type { MobileOpenShift, MobileShiftRequest } from "@dubgrid/contracts";
import {
  computeCoverageCategorySnapshots,
  summarizeCoverageByFocusArea,
  summarizeCoverageTotals,
  type CoverageByFocusAreaEntry,
} from "@dubgrid/schedule-core";
import { MobileApiAuthorizationError } from "./read";
import {
  buildActivityFeed,
  buildCoverageSectionsResponse,
  buildHeroSummary,
  computeStaffHoursForPeriod,
  loadMobileDashboardPayload,
  type DashboardPublishHistoryRow,
  type DashboardScheduleCellRow,
  type DashboardShiftCategoryRow,
  type MobileCoverageSummary,
} from "./dashboard";

function makeOpenShift(overrides: Partial<MobileOpenShift> = {}): MobileOpenShift {
  return {
    id: "shift-1",
    date: "2026-05-11",
    focusAreaId: 1,
    focusAreaName: "ICU",
    needed: 1,
    urgency: null,
    state: {
      kind: "worked",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    presentation: { label: "D", segments: [] } as unknown as MobileOpenShift["presentation"],
    canVolunteer: true,
    volunteerBlockReason: null,
    ...overrides,
  };
}

function makeCoverageSummary(
  overrides: Partial<MobileCoverageSummary> = {},
): MobileCoverageSummary {
  return {
    openShifts: [],
    totals: { totalRequired: 0, totalFilled: 0, pct: 100, openSlots: 0 },
    byFocusArea: [],
    hasCoverageRequirements: false,
    scheduleRows: [],
    ...overrides,
  };
}

describe("buildCoverageSectionsResponse", () => {
  it("derives openSlots from filled/required, worst coverage first", () => {
    const byFocusArea: CoverageByFocusAreaEntry[] = [
      { focusAreaId: 1, focusAreaName: "ICU", requiredTotal: 4, filledTotal: 4, pct: 100 },
      { focusAreaId: 2, focusAreaName: "ER", requiredTotal: 6, filledTotal: 2, pct: 33 },
    ];

    expect(buildCoverageSectionsResponse(byFocusArea)).toEqual([
      {
        focusAreaId: 2,
        focusAreaName: "ER",
        requiredTotal: 6,
        filledTotal: 2,
        pct: 33,
        openSlots: 4,
      },
      {
        focusAreaId: 1,
        focusAreaName: "ICU",
        requiredTotal: 4,
        filledTotal: 4,
        pct: 100,
        openSlots: 0,
      },
    ]);
  });
});

describe("computeStaffHoursForPeriod", () => {
  const shiftCategoriesById = new Map<number, DashboardShiftCategoryRow>([
    [10, { id: 10, start_time: "07:00", end_time: "19:00", break_minutes: null }], // 12h shift
  ]);
  const focusAreaNameById = new Map<number, string>([[12, "ICU"]]);
  const range = { startDate: "2026-05-11", endDate: "2026-05-17" };

  function makeRow(overrides: Partial<DashboardScheduleCellRow> = {}): DashboardScheduleCellRow {
    return {
      emp_id: "emp-1",
      date: "2026-05-11",
      focus_area_id: 12,
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

    const result = computeStaffHoursForPeriod(rows, shiftCategoriesById, focusAreaNameById, range);

    expect(result).toEqual([
      {
        employeeId: "emp-1",
        employeeName: "Alex Rivera",
        totalHours: 48,
        overtimeHours: 8,
        focusAreaId: 12,
        focusAreaName: "ICU",
      },
    ]);
  });

  it("omits employees who stay under the threshold", () => {
    const rows = [makeRow({ date: "2026-05-11" }), makeRow({ date: "2026-05-12" })]; // 24h

    expect(computeStaffHoursForPeriod(rows, shiftCategoriesById, focusAreaNameById, range)).toEqual(
      [],
    );
  });

  it("ignores absence and deleted cells", () => {
    const rows = [
      makeRow({
        date: "2026-05-11",
        state: { kind: "absence", segments: [], customStartTime: null, customEndTime: null },
      }),
    ];

    expect(computeStaffHoursForPeriod(rows, shiftCategoriesById, focusAreaNameById, range)).toEqual(
      [],
    );
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

    const result = computeStaffHoursForPeriod(rows, shiftCategoriesById, focusAreaNameById, range);
    expect(result).toEqual([
      {
        employeeId: "emp-1",
        employeeName: "Alex Rivera",
        totalHours: 44,
        overtimeHours: 4,
        focusAreaId: 12,
        focusAreaName: "ICU",
      },
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

    const result = computeStaffHoursForPeriod(rows, categoriesWithBreak, focusAreaNameById, range);

    expect(result).toEqual([
      {
        employeeId: "emp-1",
        employeeName: "Alex Rivera",
        totalHours: 46,
        overtimeHours: 6,
        focusAreaId: 12,
        focusAreaName: "ICU",
      },
    ]);
  });

  it("attributes an employee working across multiple focus areas to whichever they logged the most hours in", () => {
    const rows = [
      // 3 shifts in ICU (12h each = 36h), 1 shift in ER (12h) — ICU wins.
      makeRow({ date: "2026-05-11", focus_area_id: 12 }),
      makeRow({ date: "2026-05-12", focus_area_id: 12 }),
      makeRow({ date: "2026-05-13", focus_area_id: 12 }),
      makeRow({ date: "2026-05-14", focus_area_id: 7 }),
    ];
    const namesById = new Map<number, string>([
      [12, "ICU"],
      [7, "ER"],
    ]);

    const result = computeStaffHoursForPeriod(rows, shiftCategoriesById, namesById, range);

    expect(result[0]).toMatchObject({ focusAreaId: 12, focusAreaName: "ICU" });
  });
});

describe("buildActivityFeed", () => {
  function makeRow(
    overrides: Partial<DashboardPublishHistoryRow> = {},
  ): DashboardPublishHistoryRow {
    return {
      published_by: "profile-1",
      start_date: "2026-05-11",
      end_date: "2026-05-17",
      published_at: "2026-05-10T12:00:00.000Z",
      change_count: 0,
      changes: [],
      ...overrides,
    };
  }

  it("resolves the publisher name and sorts most recent first", () => {
    const nameByProfileId = new Map([["profile-1", "Jordan Lee"]]);
    const rows = [
      makeRow({ published_at: "2026-05-09T12:00:00.000Z" }),
      makeRow({ published_at: "2026-05-10T12:00:00.000Z" }),
    ];

    const result = buildActivityFeed(rows, [], [], nameByProfileId);

    expect(result[0]?.type).toBe("publish");
    expect(result[0]?.description).toBe("Jordan Lee published the schedule for May 11 to May 17");
    expect(result[0]?.timestamp).toBe("2026-05-10T12:00:00.000Z");
  });

  it("falls back to Someone when the publisher name can't be resolved", () => {
    const result = buildActivityFeed([makeRow({ published_by: null })], [], [], new Map());

    expect(result[0]?.description).toContain("Someone published");
  });

  it("expands each publish entry's changes into shift_change items, capped at 12 per entry", () => {
    const changes = Array.from({ length: 14 }, (_, i) => ({
      empId: `emp-${i}`,
      date: "2026-05-12",
      kind: i % 2 === 0 ? ("new" as const) : ("deleted" as const),
    }));
    const rows = [makeRow({ changes, change_count: changes.length })];

    const result = buildActivityFeed(rows, [], [], new Map(), 100);

    const shiftChangeItems = result.filter((item) => item.type === "shift_change");
    expect(shiftChangeItems).toHaveLength(12);
    expect(shiftChangeItems[0]?.description).toBe("Shift added · May 12");
    expect(shiftChangeItems[1]?.description).toBe("Shift removed · May 12");
  });

  it("turns every shift request into a request item, regardless of status", () => {
    const requests = [
      {
        id: "req-1",
        type: "pickup",
        status: "open",
        requesterName: "Alex Rivera",
        requesterShiftDate: "2026-05-12",
        requesterPresentation: { label: "D", shiftName: "Day Shift", segments: [] },
        createdAt: "2026-05-10T09:00:00.000Z",
      } as unknown as MobileShiftRequest,
    ];

    const result = buildActivityFeed([], requests, [], new Map());

    expect(result[0]).toMatchObject({
      type: "request",
      description: "Pickup request · Day Shift · Open",
      timestamp: "2026-05-10T09:00:00.000Z",
    });
  });

  it("turns accepted invitations into user_signup items", () => {
    const result = buildActivityFeed(
      [],
      [],
      [
        {
          email: "jane@example.com",
          role_to_assign: "Nurse",
          accepted_at: "2026-05-10T09:00:00.000Z",
        },
      ],
      new Map(),
    );

    expect(result[0]).toMatchObject({
      type: "user_signup",
      description: "User sign-up completed · jane@example.com (Nurse)",
      timestamp: "2026-05-10T09:00:00.000Z",
    });
  });

  it("interleaves all 4 types sorted by timestamp, most recent first", () => {
    const rows = [makeRow({ published_at: "2026-05-10T08:00:00.000Z" })];
    const requests = [
      {
        id: "req-1",
        type: "swap",
        status: "pending_approval",
        requesterName: "Alex Rivera",
        requesterShiftDate: "2026-05-12",
        requesterPresentation: { label: "D", shiftName: "Day Shift", segments: [] },
        createdAt: "2026-05-10T12:00:00.000Z",
      } as unknown as MobileShiftRequest,
    ];
    const invitations = [
      {
        email: "jane@example.com",
        role_to_assign: "Nurse",
        accepted_at: "2026-05-10T06:00:00.000Z",
      },
    ];

    const result = buildActivityFeed(rows, requests, invitations, new Map());

    expect(result.map((item) => item.type)).toEqual(["request", "publish", "user_signup"]);
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
      fetchMobileCoverageSummary: vi.fn().mockResolvedValue(makeCoverageSummary()),
      fetchMobileShiftRequests: vi.fn().mockResolvedValue([]),
      fetchMobileOpenShiftContext: vi.fn().mockResolvedValue({
        shiftCategoryRows: [],
        coverageRequirementRows: [],
        focusAreaRows: [],
      }),
      fetchMobilePublishHistoryRows: vi.fn().mockResolvedValue([]),
      fetchMobileAcceptedInvitationRows: vi.fn().mockResolvedValue([]),
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
    const pendingRequest = {
      id: "req-1",
      type: "pickup",
      status: "pending_approval",
      requesterName: "Alex Rivera",
      requesterShiftDate: "2026-05-12",
      requesterPresentation: { label: "D", shiftName: "Day Shift", segments: [] },
      createdAt: "2026-05-10T09:00:00.000Z",
    } as unknown as MobileShiftRequest;
    deps.fetchMobileShiftRequests.mockResolvedValue([pendingRequest]);

    const adminAuth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "admin",
      serviceClient: {} as never,
    };
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

  it("passes through the coverage summary's real totals/byFocusArea instead of re-deriving them", async () => {
    const deps = makeDeps();
    deps.fetchMobileCoverageSummary.mockResolvedValue(
      makeCoverageSummary({
        openShifts: [
          makeOpenShift({
            id: "s1",
            date: "2026-05-11",
            focusAreaId: 1,
            focusAreaName: "ICU",
            needed: 3,
          }),
        ],
        totals: { totalRequired: 70, totalFilled: 67, pct: 96, openSlots: 3 },
        byFocusArea: [
          { focusAreaId: 1, focusAreaName: "ICU", requiredTotal: 70, filledTotal: 67, pct: 96 },
        ],
        hasCoverageRequirements: true,
      }),
    );
    const auth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "admin",
      serviceClient: {} as never,
    };

    const payload = await loadMobileDashboardPayload(auth, range, deps);

    expect(payload.metrics.coveragePct).toBe(96);
    expect(payload.metrics.openGapCount).toBe(3);
    expect(payload.coverageBySection).toEqual([
      {
        focusAreaId: 1,
        focusAreaName: "ICU",
        requiredTotal: 70,
        filledTotal: 67,
        pct: 96,
        openSlots: 3,
      },
    ]);
  });

  it("sources staffHours from the coverage summary's scheduleRows instead of a separate fetch", async () => {
    const deps = makeDeps();
    const shiftCategoryRow = {
      id: 10,
      start_time: "07:00",
      end_time: "19:00",
      break_minutes: null,
    };
    deps.fetchMobileOpenShiftContext.mockResolvedValue({
      shiftCategoryRows: [shiftCategoryRow],
      coverageRequirementRows: [],
      focusAreaRows: [{ id: 12, name: "ICU" }],
    });
    const row: DashboardScheduleCellRow = {
      emp_id: "emp-1",
      date: "2026-05-11",
      focus_area_id: 12,
      state: {
        kind: "worked",
        segments: [{ shiftId: 10 }],
        customStartTime: null,
        customEndTime: null,
      },
      employees: { id: "emp-1", first_name: "Alex", last_name: "Rivera" },
    };
    deps.fetchMobileCoverageSummary.mockResolvedValue(
      makeCoverageSummary({ scheduleRows: [row, row, row, row] }), // 4 x 12h = 48h -> 8h OT
    );
    const auth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "admin",
      serviceClient: {} as never,
    };

    const payload = await loadMobileDashboardPayload(auth, range, deps);

    expect(payload.staffHours).toEqual([
      {
        employeeId: "emp-1",
        employeeName: "Alex Rivera",
        totalHours: 48,
        overtimeHours: 8,
        focusAreaId: 12,
        focusAreaName: "ICU",
      },
    ]);
    // No separate schedule-rows dependency exists anymore — coverage summary
    // is the single fetch both coverage math and staff hours are derived from.
    expect(deps.fetchMobileCoverageSummary).toHaveBeenCalledTimes(1);
  });

  it("reports a null coveragePct when no coverage requirements are configured", async () => {
    const deps = makeDeps();
    const auth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "admin",
      serviceClient: {} as never,
    };

    const payload = await loadMobileDashboardPayload(auth, range, deps);

    expect(payload.metrics.coveragePct).toBeNull();
    expect(payload.heroSummary.statusLabel).toBe("Setup");
  });
});

describe("cross-platform coverage parity", () => {
  // Regression test for the web-vs-mobile dashboard divergence: mobile used
  // to re-derive coverage % from `required - openGaps` instead of counting
  // real assignments. Now both loadMobileDashboardPayload (via
  // fetchMobileCoverageSummary) and web's dashboard-stats.ts feed the exact
  // same computeCoverageCategorySnapshots() into
  // summarizeCoverageTotals()/summarizeCoverageByFocusArea() from
  // @dubgrid/schedule-core, so a fixture with partial (mentored) coverage
  // credit must produce identical numbers regardless of which platform's
  // dependency shape wraps it.
  it("produces the same coveragePct/coverageBySection web would compute for the same fixture", async () => {
    const fa = { id: 1, name: "ICU" };
    const cat = { id: 1, name: "Day" };
    const mentoredCode = { id: 10, label: "D", sortOrder: 1, categoryId: 1, focusAreaId: 1 };
    const req = { focusAreaId: 1, assignmentId: 10, dayOfWeek: null, minStaff: 3 };
    const date = new Date(2026, 4, 11); // Monday
    const employeesByFocusArea = new Map([
      [1, [{ id: "emp-1" }, { id: "emp-2" }, { id: "emp-3" }]],
    ]);
    const coverageCreditForKey = (empId: string) => (empId === "emp-2" ? 0.5 : 1); // emp-2 mentored

    const snapshots = computeCoverageCategorySnapshots(
      [fa],
      [cat],
      [mentoredCode],
      [req],
      [date],
      employeesByFocusArea,
      () => [10],
      new Map([[1, new Set([10])]]),
      undefined,
      coverageCreditForKey,
    );
    const webTotals = summarizeCoverageTotals(snapshots);
    const webByFocusArea = summarizeCoverageByFocusArea(snapshots, [fa]);

    const deps = {
      fetchMobileCoverageSummary: vi.fn().mockResolvedValue(
        makeCoverageSummary({
          openShifts: [],
          totals: webTotals,
          byFocusArea: webByFocusArea,
          hasCoverageRequirements: true,
        }),
      ),
      fetchMobileShiftRequests: vi.fn().mockResolvedValue([]),
      fetchMobileOpenShiftContext: vi.fn().mockResolvedValue({
        shiftCategoryRows: [],
        coverageRequirementRows: [],
        focusAreaRows: [],
      }),
      fetchMobilePublishHistoryRows: vi.fn().mockResolvedValue([]),
      fetchMobileAcceptedInvitationRows: vi.fn().mockResolvedValue([]),
      fetchProfileNameRowsByIds: vi.fn().mockResolvedValue([]),
    };
    const auth = {
      currentOrg: { id: "org-1" },
      effectiveRole: "admin",
      serviceClient: {} as never,
    };
    const range = { startDate: "2026-05-11", endDate: "2026-05-11" };

    const payload = await loadMobileDashboardPayload(auth, range, deps);

    expect(webTotals.totalFilled).toBe(2.5); // 1 + 0.5 + 1, capped nowhere since required=3
    expect(payload.metrics.coveragePct).toBe(webTotals.pct);
    expect(payload.coverageBySection).toEqual(buildCoverageSectionsResponse(webByFocusArea));
  });
});
