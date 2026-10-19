import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountPermissionsResponse } from "@/features/account/client";
import type { OrganizationBootstrap } from "@/features/organization/client";
import { buildPerms } from "@/features/permissions";
import { queryKeys } from "@/lib/query-keys";

import { dashboardWindows, primeDashboardQueries } from "./dashboardQueries";

vi.mock("@/features/schedule/client", () => ({
  fetchShifts: vi.fn(async () => ({})),
  fetchPublishedDateRanges: vi.fn(async () => []),
  fetchPublishHistory: vi.fn(async () => []),
  fetchRecentPublishHistory: vi.fn(async () => []),
  fetchShiftRequests: vi.fn(async () => []),
  fetchScheduleNotes: vi.fn(async () => []),
}));
vi.mock("@/features/organization/client", () => ({
  fetchOrganizationInvitations: vi.fn(async () => []),
}));

const ORG_ID = "org-1";
// A Wednesday: the default week runs Sunday 2026-10-11 to Saturday 2026-10-17.
const NOW = new Date(2026, 9, 14, 9, 30);

function bootstrap(overrides: Partial<OrganizationBootstrap> = {}): OrganizationBootstrap {
  return {
    org: { id: ORG_ID, name: "Calm Haven", shiftDisplayMode: "code" },
    isGridmaster: false,
    entryGate: { onboardingCompleted: true, adminOnboardingCompleted: true, billingLocked: false },
    activeEmployeeCount: 3,
    focusAreas: [],
    allAssignmentDefinitions: [],
    allAbsenceTypes: [{ id: 5, label: "VAC", name: "Vacation" }],
    shiftCategories: [],
    jobs: [],
    ...overrides,
  } as unknown as OrganizationBootstrap;
}

function access(
  role: "user" | "admin" | "super_admin",
  overrides: Partial<AccountPermissionsResponse> = {},
): AccountPermissionsResponse {
  return {
    permissions: {
      ...buildPerms(role, ORG_ID, false),
      canEditShifts: role !== "user",
      canViewDashboardAnalytics: role !== "user",
      canManageEmployees: role !== "user",
    },
    isOnSchedule: true,
    isManagementUser: false,
    ...overrides,
  };
}

function primedKeys(queryClient: QueryClient): unknown[][] {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((query) => [...query.queryKey]);
}

describe("dashboardWindows", () => {
  const periodStart = new Date(2026, 9, 11);

  it("loads the previous week through this one for an admin", () => {
    expect(
      dashboardWindows({
        todayKey: "2026-10-14",
        isUserDashboardMode: false,
        periodStart,
        periodDays: 7,
      }),
    ).toEqual({
      schedule: { start: "2026-10-04", end: "2026-10-17" },
      period: { start: "2026-10-11", end: "2026-10-17" },
      publishedRanges: { start: "2026-10-04", end: "2026-10-17" },
      recentChanges: { start: "2026-10-11", end: "2026-10-17" },
    });
  });

  it("reaches three weeks past today on the user dashboard for the next shift", () => {
    const windows = dashboardWindows({
      todayKey: "2026-10-14",
      isUserDashboardMode: true,
      periodStart,
      periodDays: 7,
    });
    expect(windows.schedule).toEqual({ start: "2026-10-04", end: "2026-11-04" });
    expect(windows.recentChanges).toEqual({ start: "2026-10-11", end: "2026-11-04" });
    expect(windows.period).toEqual({ start: "2026-10-11", end: "2026-10-17" });
  });
});

describe("primeDashboardQueries", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("starts an admin's default week under editor keys, with history and invitations", () => {
    primeDashboardQueries(queryClient, {
      bootstrap: bootstrap(),
      access: access("admin"),
      userViewActive: false,
      now: NOW,
    });

    const keys = primedKeys(queryClient);
    const cells = keys.find((key) => key.includes("cells"));
    expect(cells?.slice(0, 7)).toEqual([
      ...queryKeys.shifts.all(ORG_ID),
      "dashboard",
      "cells",
      "2026-10-04",
      "2026-10-17",
      "editor",
    ]);
    expect(String(cells?.[7])).toContain('[5,"VAC"]');
    expect(keys).toContainEqual([
      ...queryKeys.org.publishHistory(ORG_ID),
      "dashboard",
      "2026-10-11",
      "2026-10-17",
    ]);
    expect(keys).toContainEqual([...queryKeys.org.invitations(ORG_ID)]);
    expect(keys).toContainEqual([
      ...queryKeys.shifts.all(ORG_ID),
      "scheduleNotes",
      "2026-10-04",
      "2026-10-17",
    ]);
    expect(keys).toContainEqual([
      ...queryKeys.shiftRequests.all(ORG_ID),
      "2026-10-11",
      "2026-10-17",
      "all",
      "[]",
    ]);
  });

  it("keeps a staff member's cells under a viewer key and skips admin-only reads", () => {
    primeDashboardQueries(queryClient, {
      bootstrap: bootstrap(),
      access: access("user"),
      userViewActive: false,
      now: NOW,
    });

    const keys = primedKeys(queryClient);
    const cells = keys.find((key) => key.includes("cells"));
    expect(cells?.slice(3, 7)).toEqual(["cells", "2026-10-04", "2026-11-04", "viewer"]);
    expect(keys.some((key) => key.includes("publishHistory"))).toBe(false);
    expect(keys).not.toContainEqual([...queryKeys.org.invitations(ORG_ID)]);
  });

  it.each([
    [
      "an organization still onboarding",
      {
        bootstrap: bootstrap({
          entryGate: {
            onboardingCompleted: false,
            adminOnboardingCompleted: true,
            billingLocked: false,
          },
        }),
      },
    ],
    [
      "a locked organization",
      {
        bootstrap: bootstrap({
          entryGate: {
            onboardingCompleted: true,
            adminOnboardingCompleted: true,
            billingLocked: true,
          },
        }),
      },
    ],
    ["no organization", { bootstrap: bootstrap({ org: null }) }],
    [
      "a management-only account sent to the schedule",
      { access: access("user", { isManagementUser: true, isOnSchedule: false }) },
    ],
    ["an admin previewing as a user", { userViewActive: true }],
  ])("asks for nothing for %s", (_label, overrides) => {
    primeDashboardQueries(queryClient, {
      bootstrap: bootstrap(),
      access: access("admin"),
      userViewActive: false,
      now: NOW,
      ...overrides,
    });

    expect(primedKeys(queryClient)).toEqual([]);
  });
});
