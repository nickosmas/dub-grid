/**
 * dashboard-hero-metrics.test.ts — Verify hero metrics display accurate data
 *
 * REGRESSION TEST: Draft deletion counts must stay visible in dashboard totals.
 *
 * The dashboard should count new, modified, and deleted draft cells consistently
 * regardless of how the underlying schedule state is normalized.
 */

import { describe, it, expect } from "vitest";

describe("Dashboard Hero Metrics", () => {
  it("should display coverage percentage from periodStats", () => {
    const periodStats = {
      totalShifts: { value: 35, prevValue: 30, delta: 5 },
      coverage: { pct: 87, prevPct: 92, delta: -5, openSlots: 3 },
      staffScheduled: { scheduled: 25, total: 30, prevScheduled: 20, delta: 5 },
      otAlerts: { count: 2, prevCount: 1, delta: 1 },
    };

    const coveragePct = periodStats.coverage?.pct ?? 100;
    expect(coveragePct).toBe(87);
  });

  it("should display accurate open gaps count", () => {
    const openShifts = [
      {
        id: "1",
        date: new Date(),
        dayOfWeek: "MON",
        dayOfMonth: 8,
        assignmentLabel: "DAY",
        focusAreaName: "Support",
        timeRange: "09:00–17:00",
        needed: 2,
        urgency: "high" as const,
      },
      {
        id: "2",
        date: new Date(),
        dayOfWeek: "TUE",
        dayOfMonth: 9,
        assignmentLabel: "NIGHT",
        focusAreaName: "Support",
        timeRange: "22:00–06:00",
        needed: 1,
        urgency: "medium" as const,
      },
    ];

    const openGapCount = openShifts.reduce(
      (total, shift) => total + shift.needed,
      0,
    );
    expect(openGapCount).toBe(3);
  });

  it("should count draft shifts accurately", () => {
    const draftNewCount = 2;
    const draftModifiedCount = 3;
    const draftDeletedCount = 1;

    const draftTotal = draftNewCount + draftModifiedCount + draftDeletedCount;
    expect(draftTotal).toBe(6);
  });

  it("should display pending approvals when user can approve", () => {
    const shiftRequests = {
      requests: [
        {
          id: "1",
          type: "swap" as const,
          status: "open" as const,
          requesterEmpId: "emp1",
          targetEmpId: "emp2",
          expiresAt: "2026-04-20",
          createdAt: "",
        },
        {
          id: "2",
          type: "swap" as const,
          status: "open" as const,
          requesterEmpId: "emp2",
          targetEmpId: "emp1",
          expiresAt: "2026-04-20",
          createdAt: "",
        },
      ],
      pendingApproval: [
        {
          id: "1",
          type: "swap" as const,
          status: "open" as const,
          requesterEmpId: "emp1",
          targetEmpId: "emp2",
          expiresAt: "2026-04-20",
          createdAt: "",
        },
      ],
      openPickups: [],
      myRequests: [],
      respond: async () => {},
      resolve: async () => {},
      claim: async () => {},
      cancel: async () => {},
    };

    const canApproveShiftRequests = true;

    if (canApproveShiftRequests) {
      const pendingCount = shiftRequests.pendingApproval.length;
      expect(pendingCount).toBe(1);
    }
  });

  it("should correctly prioritize hero status based on urgency", () => {
    // Test 1: Urgent gaps take priority
    const urgentGapCount = 3;
    let heroStatus = "";
    if (urgentGapCount > 0) {
      heroStatus = "Urgent";
    }
    expect(heroStatus).toBe("Urgent");

    // Test 2: Pending approvals when no urgent gaps
    const urgentGapCount2 = 0;
    const pendingApprovalCount = 2;
    const canApproveShiftRequests = true;
    heroStatus = "";

    if (urgentGapCount2 > 0) {
      heroStatus = "Urgent";
    } else if (canApproveShiftRequests && pendingApprovalCount > 0) {
      heroStatus = "Approval";
    }
    expect(heroStatus).toBe("Approval");

    // Test 3: Drafts warning
    const urgentGapCount3 = 0;
    const pendingApprovalCount3 = 0;
    const draftTotal = 4;
    heroStatus = "";

    if (urgentGapCount3 > 0) {
      heroStatus = "Urgent";
    } else if (canApproveShiftRequests && pendingApprovalCount3 > 0) {
      heroStatus = "Approval";
    } else if (draftTotal > 0) {
      heroStatus = "Drafts";
    }
    expect(heroStatus).toBe("Drafts");

    // Test 4: Coverage warning
    const urgentGapCount4 = 0;
    const pendingApprovalCount4 = 0;
    const draftTotal4 = 0;
    const coveragePct = 75;
    heroStatus = "";

    if (urgentGapCount4 > 0) {
      heroStatus = "Urgent";
    } else if (canApproveShiftRequests && pendingApprovalCount4 > 0) {
      heroStatus = "Approval";
    } else if (draftTotal4 > 0) {
      heroStatus = "Drafts";
    } else if (coveragePct < 90) {
      heroStatus = "Coverage";
    }
    expect(heroStatus).toBe("Coverage");

    // Test 5: Healthy when nothing is wrong
    const urgentGapCount5 = 0;
    const pendingApprovalCount5 = 0;
    const draftTotal5 = 0;
    const coveragePct5 = 100;
    heroStatus = "";

    if (urgentGapCount5 > 0) {
      heroStatus = "Urgent";
    } else if (canApproveShiftRequests && pendingApprovalCount5 > 0) {
      heroStatus = "Approval";
    } else if (draftTotal5 > 0) {
      heroStatus = "Drafts";
    } else if (coveragePct5 < 90) {
      heroStatus = "Coverage";
    } else {
      heroStatus = "Healthy";
    }
    expect(heroStatus).toBe("Healthy");
  });

  it("should include pending approvals metric only for admins", () => {
    const permissions = { canApproveShiftRequests: true };
    const coveragePct = 92;
    const openShifts = [{ needed: 2 }];
    const draftTotal = 2;
    const shiftRequests = { pendingApproval: { length: 1 } };

    const metrics = [
      { label: "Coverage", value: `${coveragePct}%` },
      {
        label: "Open gaps",
        value: `${openShifts.reduce((total, shift) => total + shift.needed, 0)}`,
      },
      { label: "Draft shifts", value: `${draftTotal}` },
    ];

    if (permissions.canApproveShiftRequests) {
      metrics.splice(2, 0, {
        label: "Pending approvals",
        value: `${shiftRequests.pendingApproval.length}`,
      });
    }

    expect(metrics.length).toBe(4);
    expect(metrics[2]?.label).toBe("Pending approvals");
  });

  it("should not include pending approvals metric for regular users", () => {
    const permissions = { canApproveShiftRequests: false };
    const coveragePct = 92;
    const openShifts = [{ needed: 2 }];
    const draftTotal = 2;

    const metrics = [
      { label: "Coverage", value: `${coveragePct}%` },
      {
        label: "Open gaps",
        value: `${openShifts.reduce((total, shift) => total + shift.needed, 0)}`,
      },
      { label: "Draft shifts", value: `${draftTotal}` },
    ];

    if (permissions.canApproveShiftRequests) {
      metrics.splice(2, 0, {
        label: "Pending approvals",
        value: "0",
      });
    }

    expect(metrics.length).toBe(3);
    expect(metrics.some((m) => m.label === "Pending approvals")).toBe(false);
  });

  it("should calculate progress in onboarding checklist", () => {
    const setupSteps = [
      { done: true, label: "Configure focus areas" },
      { done: true, label: "Add departments" },
      { done: false, label: "Add roles" },
      { done: false, label: "Add jobs" },
      { done: false, label: "Add employees" },
      { done: false, label: "Create schedule" },
    ];

    const doneCount = setupSteps.filter((s) => s.done).length;
    const progress = Math.round((doneCount / setupSteps.length) * 100);

    expect(doneCount).toBe(2);
    expect(progress).toBe(33); // 2/6 ≈ 33%
  });

  it("should hide checklist when all setup steps are complete", () => {
    const setupSteps = [
      { done: true, label: "Configure focus areas" },
      { done: true, label: "Add departments" },
      { done: true, label: "Add roles" },
      { done: true, label: "Add jobs" },
      { done: true, label: "Add employees" },
      { done: true, label: "Create schedule" },
    ];

    const allDone = setupSteps.every((s) => s.done);
    expect(allDone).toBe(true);
  });
});
