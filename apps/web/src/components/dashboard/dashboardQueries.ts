import { queryOptions, type QueryClient } from "@tanstack/react-query";

import type { AccountPermissionsResponse } from "@/features/account/client";
import type { OrganizationBootstrap } from "@/features/organization/client";
import type { Permissions } from "@/features/permissions/client";
import {
  fetchPublishHistory,
  fetchPublishedDateRanges,
  fetchRecentPublishHistory,
  fetchShiftRequests,
  fetchShifts,
} from "@/features/schedule/client";
import { buildAbsenceTypeLabelMap } from "@/hooks/useOrganizationData";
import { serializeLabelMap, shiftRequestsQueryKey } from "@/hooks/useShiftRequests";
import { buildAssignableShiftDisplayMap } from "@/lib/assignable-shifts";
import { queryKeys } from "@/lib/query-keys";
import { getScheduleStartForSpan } from "@/lib/schedule-view";
import { addDays, formatDateKey } from "@/lib/utils";
import type { PublishChange, PublishHistoryEntryWithName, ShiftMap } from "@/types";

import { dashboardScheduleWindow } from "./dashboardScheduleNotes";
import { dashboardInvitationsQueryOptions } from "./useDashboardInvitations";
import { dashboardScheduleNotesQueryOptions } from "./useDashboardScheduleNotes";

/**
 * On the user dashboard the hero highlights your current or next shift, which
 * may fall outside the period being browsed, so always load this many days
 * forward from today.
 */
export const HERO_LOOKAHEAD_DAYS = 21;

interface DateWindow {
  start: string;
  end: string;
}

export interface DashboardWindows {
  /** Shifts and schedule notes: the previous period through this one, plus the hero lookahead. */
  schedule: DateWindow;
  /** The browsed period: requests and publish history. */
  period: DateWindow;
  /** The previous period's start to this one's end, so both coverage figures filter alike. */
  publishedRanges: DateWindow;
  /** The browsed period, widened on the user dashboard to today through the hero lookahead. */
  recentChanges: DateWindow;
}

export function dashboardWindows(input: {
  todayKey: string;
  isUserDashboardMode: boolean;
  periodStart: Date;
  periodDays: number;
}): DashboardWindows {
  const { todayKey, isUserDashboardMode, periodStart, periodDays } = input;
  const periodEnd = addDays(periodStart, periodDays - 1);
  const prevPeriodStart = addDays(periodStart, -periodDays);
  const today = new Date(`${todayKey}T00:00:00`);
  const heroEnd = addDays(today, HERO_LOOKAHEAD_DAYS);
  const period = { start: formatDateKey(periodStart), end: formatDateKey(periodEnd) };
  return {
    schedule: dashboardScheduleWindow({
      todayKey,
      isUserDashboardMode,
      prevPeriodStart,
      periodEnd,
      heroLookaheadDays: HERO_LOOKAHEAD_DAYS,
    }),
    period,
    publishedRanges: { start: formatDateKey(prevPeriodStart), end: period.end },
    recentChanges: {
      start: formatDateKey(isUserDashboardMode && today < periodStart ? today : periodStart),
      end: formatDateKey(isUserDashboardMode && heroEnd > periodEnd ? heroEnd : periodEnd),
    },
  };
}

/** The week the dashboard opens on. */
export function dashboardDefaultPeriodStart(today: Date): Date {
  return getScheduleStartForSpan({ date: today, span: 1, payPeriodStartDate: null });
}

/** Who the schedule API answers with drafts; drafts are never cached under a viewer's key. */
export function isDashboardScheduler(permissions: Pick<Permissions, "level" | "canEditShifts">) {
  return permissions.level >= 2 || permissions.canEditShifts;
}

export function dashboardLabelsKey(
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap: Map<number, string>,
): string {
  return `${serializeLabelMap(assignmentLabelMap)}|${serializeLabelMap(absenceTypeMap)}`;
}

function dashboardKey(orgId: string) {
  return [...queryKeys.shifts.all(orgId), "dashboard"] as const;
}

/**
 * The schedule API renders labels into each cell and withholds drafts from
 * anyone who cannot edit shifts, so both belong in the key. Under the
 * organization's shifts so the realtime schedule invalidation refreshes it.
 */
export function dashboardShiftsQueryOptions(input: {
  orgId: string;
  isScheduler: boolean;
  window: DateWindow;
  assignmentLabelMap: Map<number, string>;
  absenceTypeMap: Map<number, string>;
  labelsKey: string;
}) {
  const { orgId, isScheduler, window, assignmentLabelMap, absenceTypeMap, labelsKey } = input;
  return queryOptions<ShiftMap>({
    queryKey: [
      ...dashboardKey(orgId),
      "cells",
      window.start,
      window.end,
      isScheduler ? "editor" : "viewer",
      labelsKey,
    ],
    queryFn: () =>
      fetchShifts(orgId, isScheduler, assignmentLabelMap, absenceTypeMap, window.start, window.end),
  });
}

type PublishedRange = Awaited<ReturnType<typeof fetchPublishedDateRanges>>[number];

/** A failure reads as nothing published rather than holding the dashboard back. */
export function dashboardPublishedRangesQueryOptions(orgId: string, window: DateWindow) {
  return queryOptions<PublishedRange[]>({
    queryKey: [...dashboardKey(orgId), "publishedRanges", window.start, window.end],
    queryFn: () => fetchPublishedDateRanges(orgId, window.start, window.end).catch(() => []),
  });
}

/**
 * Publishes overlapping the period, for the admin Activity Feed and publish
 * banner. Only asked for by viewers the route lets read it.
 */
export function dashboardPublishHistoryQueryOptions(orgId: string, window: DateWindow) {
  return queryOptions<PublishHistoryEntryWithName[]>({
    queryKey: [...queryKeys.org.publishHistory(orgId), "dashboard", window.start, window.end],
    queryFn: () =>
      fetchPublishHistory(orgId, 100, 0, { startDate: window.start, endDate: window.end }).catch(
        () => [],
      ),
  });
}

/** The latest published change per cell, newest publish winning. */
export function dashboardRecentChangesQueryOptions(
  orgId: string,
  window: DateWindow,
  isScheduler: boolean,
) {
  return queryOptions<Map<string, PublishChange>>({
    queryKey: [
      ...dashboardKey(orgId),
      "recentChanges",
      window.start,
      window.end,
      isScheduler ? "editor" : "viewer",
    ],
    queryFn: async () => {
      const entries = await fetchRecentPublishHistory(orgId, null, true, {
        startDate: window.start,
        endDate: window.end,
      }).catch(() => []);
      const changes = new Map<string, PublishChange>();
      for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex -= 1) {
        for (const change of entries[entryIndex].changes) {
          changes.set(`${change.empId}_${change.date}`, change);
        }
      }
      return changes;
    },
  });
}

/**
 * Starts the dashboard's default week from the sign-in's bootstrap and
 * permissions, under the keys DashboardView reads, so the first screen does
 * not wait for the view to mount before asking. Anyone the dashboard will not
 * open for (onboarding, a locked organization, a management-only account, an
 * admin previewing as a user) is left alone; a key that does not match what
 * the view later computes is only an unused request.
 */
export function primeDashboardQueries(
  queryClient: QueryClient,
  input: {
    bootstrap: OrganizationBootstrap;
    access: AccountPermissionsResponse;
    userViewActive: boolean;
    now: Date;
  },
): void {
  const { bootstrap, access, userViewActive, now } = input;
  const org = bootstrap.org;
  const { permissions } = access;
  if (!org || bootstrap.isGridmaster || userViewActive) return;
  const gate = bootstrap.entryGate;
  if (!gate.onboardingCompleted || !gate.adminOnboardingCompleted || gate.billingLocked) return;
  if (permissions.role === "user" && access.isManagementUser && !access.isOnSchedule) return;

  const orgId = org.id;
  const isUserDashboardMode = permissions.level < 2;
  const isScheduler = isDashboardScheduler(permissions);
  const windows = dashboardWindows({
    todayKey: formatDateKey(now),
    isUserDashboardMode,
    periodStart: dashboardDefaultPeriodStart(now),
    periodDays: 7,
  });
  const assignmentLabelMap = buildAssignableShiftDisplayMap({
    assignments: bootstrap.allAssignmentDefinitions ?? [],
    shiftCategories: bootstrap.shiftCategories ?? [],
    jobs: bootstrap.jobs ?? [],
    focusAreas: bootstrap.focusAreas ?? [],
    shiftDisplayMode: org.shiftDisplayMode ?? "code",
  });
  const absenceTypeMap = buildAbsenceTypeLabelMap(
    bootstrap.allAbsenceTypes ?? [],
    org.shiftDisplayMode,
  );

  void queryClient.prefetchQuery(
    dashboardShiftsQueryOptions({
      orgId,
      isScheduler,
      window: windows.schedule,
      assignmentLabelMap,
      absenceTypeMap,
      labelsKey: dashboardLabelsKey(assignmentLabelMap, absenceTypeMap),
    }),
  );
  void queryClient.prefetchQuery(
    dashboardPublishedRangesQueryOptions(orgId, windows.publishedRanges),
  );
  void queryClient.prefetchQuery(dashboardScheduleNotesQueryOptions(orgId, windows.schedule));
  void queryClient.prefetchQuery(
    dashboardRecentChangesQueryOptions(orgId, windows.recentChanges, isScheduler),
  );
  void queryClient.prefetchQuery({
    queryKey: shiftRequestsQueryKey(
      orgId,
      windows.period.start,
      windows.period.end,
      true,
      serializeLabelMap(assignmentLabelMap),
    ),
    queryFn: () =>
      fetchShiftRequests(orgId, assignmentLabelMap, {
        startDate: windows.period.start,
        endDate: windows.period.end,
      }),
    staleTime: 15_000,
  });
  if (isUserDashboardMode) return;
  if (permissions.canViewDashboardAnalytics) {
    void queryClient.prefetchQuery(dashboardPublishHistoryQueryOptions(orgId, windows.period));
  }
  if (permissions.canManageEmployees) {
    void queryClient.prefetchQuery(dashboardInvitationsQueryOptions(orgId));
  }
}
