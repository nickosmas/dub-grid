"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useShiftRequests, useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { queryKeys } from "@/lib/query-keys";

import type { Permissions, WebPermissions } from "@/hooks";
import type {
  Organization,
  FocusArea,
  AssignmentDefinition,
  ShiftCategory,
  JobDefinition,
  CoverageRequirement,
  Employee,
  AbsenceType,
  ShiftMap,
  PublishHistoryEntry,
  PublishHistoryEntryWithName,
  NamedItem,
  Department,
  Invitation,
  ShiftRequest,
} from "@/types";
import {
  fetchShifts,
  fetchPublishHistory,
  fetchPublishedDateRanges,
  fetchShiftRequests,
} from "@/features/schedule/client";
import { fetchOrganizationInvitations } from "@/features/organization/client";
import {
  buildPublishedDateSet,
  filterPublishedDates,
  getPublishedWindowState,
} from "@/lib/schedule-logic";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import {
  getWeekStart,
  getDatesInRange,
  addDays,
  filterShiftsByWeek,
  computeAllEmployeeHours,
  computeOTAlerts,
  countShifts,
  countStaffScheduled,
  computeCoveragePctAndSlots,
  computeWeeklyStats,
  computeCoverageBySection,
  coverageFromSections,
  computeOpenShifts,
  computeShiftBreakdown,
  buildActivityFeed,
  computeCoverageTrendData,
} from "@/lib/dashboard-stats";
import { getScheduleStartForSpan } from "@/lib/schedule-view";
import { formatDateKey } from "@/lib/utils";

export type ViewMode = "day" | "week" | "2weeks";

import DashboardHeader from "./DashboardHeader";
import UserDashboard from "./UserDashboard";
import AdminDashboard from "./AdminDashboard";
import SuperAdminDashboard from "./SuperAdminDashboard";
import { EmptyState } from "@/components/EmptyState";
import DashboardGreeting from "./DashboardGreeting";
import DashboardHero from "./DashboardHero";
import DashboardChecklist from "./DashboardChecklist";
import DashboardLoading from "./DashboardLoading";
const ExpandedStats = dynamic(() => import("./expanded/ExpandedStats"), {
  ssr: false,
});
const ExpandedCoverage = dynamic(() => import("./expanded/ExpandedCoverage"), {
  ssr: false,
});
const ExpandedOpenShifts = dynamic(() => import("./expanded/ExpandedOpenShifts"), { ssr: false });
const ExpandedStaffHours = dynamic(() => import("./expanded/ExpandedStaffHours"), { ssr: false });
const ExpandedBreakdown = dynamic(() => import("./expanded/ExpandedBreakdown"), { ssr: false });
const ExpandedActivity = dynamic(() => import("./expanded/ExpandedActivity"), {
  ssr: false,
});

type ExpandedPanel =
  "stats" | "coverage" | "openShifts" | "staffHours" | "breakdown" | "activity" | null;

export type DashboardRoleVariant = "user" | "admin" | "super-admin";

// On the user dashboard the hero highlights your current/next shift, which may
// fall outside the period being browsed. Always load this many days forward
// from today so the hero can find the genuine next upcoming shift.
const HERO_LOOKAHEAD_DAYS = 21;

interface DashboardViewProps {
  org: Organization;
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  coverageRequirements: CoverageRequirement[];
  assignmentLabelMap: Map<number, string>;
  assignmentById: Map<number, AssignmentDefinition>;
  absenceTypeMap: Map<number, string>;
  absenceTypes: AbsenceType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  departments: Department[];
  employees: Employee[];
  permissions: WebPermissions;
}

export function hasDashboardAdminCapability(permissions: Pick<Permissions, "level">): boolean {
  return permissions.level >= 2;
}

export function getDashboardRoleVariant(
  permissions: Pick<Permissions, "level" | "isUserViewActive">,
): DashboardRoleVariant {
  if (permissions.isUserViewActive) {
    return "user";
  }

  if (permissions.level >= 3) {
    return "super-admin";
  }

  if (permissions.level >= 2) {
    return "admin";
  }

  return "user";
}

export function getDashboardPeriodLabel(viewMode: ViewMode): string {
  if (viewMode === "day") {
    return "today";
  }

  if (viewMode === "2weeks") {
    return "these 2 weeks";
  }

  return "this week";
}

// Weekly overtime threshold. computeEmployeeWeeklyHours evaluates it per
// 7-day chunk of the period, so this stays flat rather than scaling with
// periodDays — scaling it here would let a light week mask a heavy one.
export function getDashboardOvertimeThreshold(_periodDays: number): number {
  return 40;
}

function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: number | undefined;

    function scheduleNextTick() {
      const current = new Date();
      const delay = 60_000 - current.getSeconds() * 1000 - current.getMilliseconds();
      timeoutId = window.setTimeout(
        () => {
          setNow(new Date());
          scheduleNextTick();
        },
        Math.max(250, delay),
      );
    }

    scheduleNextTick();

    return () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return now;
}

export default function DashboardView({
  org,
  focusAreas,
  assignments,
  shiftCategories,
  jobs,
  coverageRequirements,
  assignmentLabelMap,
  assignmentById,
  absenceTypeMap,
  absenceTypes,
  certifications,
  orgRoles,
  departments,
  employees,
  permissions,
}: DashboardViewProps) {
  const { user: authUser } = useAuth();
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  const hasAdminCapability = hasDashboardAdminCapability(permissions);
  const dashboardRoleVariant = getDashboardRoleVariant(permissions);
  const isUserDashboardMode = dashboardRoleVariant === "user";

  // ─── Expanded panel state ─────────────────────────────
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const closeExpanded = useCallback(() => setExpandedPanel(null), []);
  const handleExpandPanel = useCallback(
    (panel: string) => setExpandedPanel(panel as ExpandedPanel),
    [],
  );

  // ─── View mode + period navigation ─────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  // The user dashboard is built around a multi-day schedule view, so it offers
  // Week and 2 Weeks only (no Day); any other selection falls back to Week.
  const effectiveViewMode = isUserDashboardMode
    ? viewMode === "2weeks"
      ? "2weeks"
      : "week"
    : viewMode;
  const periodDays = effectiveViewMode === "day" ? 1 : effectiveViewMode === "2weeks" ? 14 : 7;
  const periodLabel = getDashboardPeriodLabel(effectiveViewMode);
  const overtimeThreshold = getDashboardOvertimeThreshold(periodDays);

  // The 2-week view aligns to the org's biweekly pay-period anchor (when set),
  // matching the schedule page, so it shows the full published pay period
  // rather than an arbitrary "current week + next week" window.
  const payPeriodStartDate = org.payPeriodStartDate ?? null;
  const alignPeriodStart = useCallback(
    (date: Date, mode: ViewMode): Date => {
      if (mode === "day") {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      if (mode === "2weeks") {
        return getScheduleStartForSpan({ date, span: 2, payPeriodStartDate });
      }
      return getWeekStart(date);
    },
    [payPeriodStartDate],
  );

  const [periodStart, setPeriodStart] = useState<Date>(() => getWeekStart(new Date()));
  const currentTime = useMinuteNow();
  // Day-granular "today" key: changes only at midnight, so it can drive the
  // fetch window / hero look-ahead without re-running every minute.
  const todayKey = formatDateKey(currentTime);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      // Snap to the aligned start for the new mode (pay period for 2 weeks).
      setPeriodStart((d) => alignPeriodStart(d, mode));
    },
    [alignPeriodStart],
  );

  const periodEnd = useMemo(() => addDays(periodStart, periodDays - 1), [periodStart, periodDays]);
  const periodDates = useMemo(
    () => getDatesInRange(periodStart, periodDays),
    [periodStart, periodDays],
  );
  const prevPeriodStart = useMemo(
    () => addDays(periodStart, -periodDays),
    [periodStart, periodDays],
  );

  const periodStartKey = useMemo(() => formatDateKey(periodStart), [periodStart]);
  const periodEndKey = useMemo(() => formatDateKey(periodEnd), [periodEnd]);
  const prevPeriodStartKey = useMemo(() => formatDateKey(prevPeriodStart), [prevPeriodStart]);
  const prevPeriodEndKey = useMemo(() => formatDateKey(addDays(periodStart, -1)), [periodStart]);

  const periodDateKeys = useMemo(() => periodDates.map(formatDateKey), [periodDates]);
  const prevPeriodDateKeys = useMemo(
    () => getDatesInRange(prevPeriodStart, periodDays).map(formatDateKey),
    [prevPeriodStart, periodDays],
  );

  const prevPeriodLabel =
    effectiveViewMode === "day"
      ? "yesterday"
      : effectiveViewMode === "2weeks"
        ? "last 2 weeks"
        : "last week";

  const handlePrev = useCallback(
    () => setPeriodStart((d) => addDays(d, -periodDays)),
    [periodDays],
  );
  const handleNext = useCallback(() => setPeriodStart((d) => addDays(d, periodDays)), [periodDays]);
  const handleToday = useCallback(() => {
    setPeriodStart(alignPeriodStart(new Date(), effectiveViewMode));
  }, [alignPeriodStart, effectiveViewMode]);

  // ─── Data fetching ──────────────────────────────────────
  const [allShifts, setAllShifts] = useState<ShiftMap>({});
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry | null>(null);
  const [activityPublishHistory, setActivityPublishHistory] = useState<
    PublishHistoryEntryWithName[]
  >([]);
  const [activityRequests, setActivityRequests] = useState<ShiftRequest[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [publishedDateRanges, setPublishedDateRanges] = useState<
    { startDate: string; endDate: string }[]
  >([]);

  const orgId = org.id;
  const isScheduler = permissions.level >= 2 || permissions.canEditShifts;

  const invitationsQuery = useQuery<Invitation[]>({
    queryKey: queryKeys.org.invitations(orgId),
    queryFn: () => fetchOrganizationInvitations(orgId),
  });
  const invitations = invitationsQuery.data ?? [];

  // Stable refs for Maps to avoid re-fetching on every render
  // (Map objects have no referential stability)
  const assignmentLabelMapRef = useLatestRef(assignmentLabelMap);
  const absenceTypeMapRef = useLatestRef(absenceTypeMap);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShiftsLoading(true);

    // Fetch the date range needed: previous period start → current period end.
    // On the user dashboard the window is widened to always cover
    // [today, today + HERO_LOOKAHEAD_DAYS] as well, so the hero can surface the
    // next upcoming shift even when it falls outside the period being browsed.
    const today = new Date(`${todayKey}T00:00:00`);
    const lookaheadEnd = addDays(today, HERO_LOOKAHEAD_DAYS);
    const fetchStart = formatDateKey(
      isUserDashboardMode && today < prevPeriodStart ? today : prevPeriodStart,
    );
    const fetchEnd = formatDateKey(
      isUserDashboardMode && lookaheadEnd > periodEnd ? lookaheadEnd : periodEnd,
    );
    Promise.all([
      fetchShifts(
        orgId,
        isScheduler,
        assignmentLabelMapRef.current,
        absenceTypeMapRef.current,
        fetchStart,
        fetchEnd,
      ),
      fetchPublishedDateRanges(orgId, periodStartKey, periodEndKey).catch(() => []),
      fetchPublishHistory(orgId, 20, 0).catch(() => []),
      fetchShiftRequests(orgId, assignmentLabelMapRef.current).catch(() => []),
    ])
      .then(([shifts, publishedRanges, publishRows, requestRows]) => {
        if (cancelled) return;
        setAllShifts(shifts);
        setPublishedDateRanges(publishedRanges);
        setPublishHistory(publishRows[0] ?? null);
        setActivityPublishHistory(publishRows);
        setActivityRequests(requestRows);
        setShiftsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setShiftsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    orgId,
    isScheduler,
    isUserDashboardMode,
    todayKey,
    periodEnd,
    periodEndKey,
    periodStartKey,
    prevPeriodStart,
  ]);

  // Shift requests
  const currentEmpId = useMemo(
    () => (authUser ? (employees.find((e) => e.userId === authUser.id)?.id ?? null) : null),
    [employees, authUser],
  );

  const currentEmployee = useMemo(
    () => (currentEmpId ? employees.find((e) => e.id === currentEmpId) : undefined),
    [employees, currentEmpId],
  );

  const shiftRequests = useShiftRequests(
    orgId,
    assignmentLabelMap,
    currentEmpId,
    permissions.canApproveShiftRequests,
    org.timezone ?? null,
  );

  // ─── Filter shifts by period ─────────────────────────────
  const currentPeriodShifts = useMemo(
    () => filterShiftsByWeek(allShifts, periodStartKey, periodEndKey),
    [allShifts, periodStartKey, periodEndKey],
  );

  const prevPeriodShifts = useMemo(
    () => filterShiftsByWeek(allShifts, prevPeriodStartKey, prevPeriodEndKey),
    [allShifts, prevPeriodStartKey, prevPeriodEndKey],
  );
  const publishedDateSet = useMemo(
    () => buildPublishedDateSet(publishedDateRanges),
    [publishedDateRanges],
  );
  const publishedWindowState = useMemo<PublishedWindowState>(
    () => getPublishedWindowState(periodDates, publishedDateSet),
    [periodDates, publishedDateSet],
  );
  const publishedPeriodDates = useMemo(
    () =>
      coverageRequirements.length === 0
        ? periodDates
        : filterPublishedDates(periodDates, publishedDateSet),
    [coverageRequirements.length, periodDates, publishedDateSet],
  );

  // ─── Computations ───────────────────────────────────────
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === "active"),
    [employees],
  );

  const absenceTypeById = useMemo(
    () => new Map(absenceTypes.map((at) => [at.id, at])),
    [absenceTypes],
  );

  // Break-aware hour computation maps
  const categoryById = useMemo(
    () => new Map(shiftCategories.map((c) => [c.id, c])),
    [shiftCategories],
  );
  // Employee hours (current + prev period)
  const currentHours = useMemo(
    () =>
      computeAllEmployeeHours(
        activeEmployees,
        periodDateKeys,
        currentPeriodShifts,
        assignmentById,
        overtimeThreshold,
        categoryById,
      ),
    [
      activeEmployees,
      periodDateKeys,
      currentPeriodShifts,
      assignmentById,
      categoryById,
      overtimeThreshold,
    ],
  );

  const prevHours = useMemo(
    () =>
      computeAllEmployeeHours(
        activeEmployees,
        prevPeriodDateKeys,
        prevPeriodShifts,
        assignmentById,
        overtimeThreshold,
        categoryById,
      ),
    [
      activeEmployees,
      prevPeriodDateKeys,
      prevPeriodShifts,
      assignmentById,
      categoryById,
      overtimeThreshold,
    ],
  );

  // OT alerts
  const otAlerts = useMemo(
    () => computeOTAlerts(currentHours, activeEmployees, focusAreas),
    [currentHours, activeEmployees, focusAreas],
  );

  const prevOtCount = useMemo(
    () => computeOTAlerts(prevHours, activeEmployees, focusAreas).length,
    [prevHours, activeEmployees, focusAreas],
  );

  // Coverage by section
  const sectionCoverage = useMemo(
    () =>
      computeCoverageBySection(
        focusAreas,
        publishedPeriodDates,
        currentPeriodShifts,
        activeEmployees,
        coverageRequirements,
        assignments,
        org.coverageRuleConfig,
      ),
    [
      focusAreas,
      publishedPeriodDates,
      currentPeriodShifts,
      activeEmployees,
      coverageRequirements,
      assignments,
      org.coverageRuleConfig,
    ],
  );

  // Stat cards
  const periodStats = useMemo(() => {
    const currentCoverage = coverageFromSections(sectionCoverage);
    const prevPeriodDates = getDatesInRange(prevPeriodStart, periodDays);
    const prevCoverage = computeCoveragePctAndSlots(
      focusAreas,
      assignments,
      coverageRequirements,
      prevPeriodDates,
      activeEmployees,
      prevPeriodShifts,
      org.coverageRuleConfig,
    );

    return computeWeeklyStats(
      {
        shiftCount: countShifts(currentPeriodShifts, assignmentById),
        coveragePct: currentCoverage.pct,
        openSlots: currentCoverage.openSlots,
        staffScheduled: countStaffScheduled(currentPeriodShifts, assignmentById),
        otCount: otAlerts.length,
      },
      {
        shiftCount: countShifts(prevPeriodShifts, assignmentById),
        coveragePct: prevCoverage.pct,
        staffScheduled: countStaffScheduled(prevPeriodShifts, assignmentById),
        otCount: prevOtCount,
      },
      activeEmployees.length,
    );
  }, [
    sectionCoverage,
    currentPeriodShifts,
    prevPeriodShifts,
    assignmentById,
    focusAreas,
    assignments,
    coverageRequirements,
    prevPeriodStart,
    periodDays,
    activeEmployees,
    otAlerts.length,
    prevOtCount,
    org.coverageRuleConfig,
  ]);

  // Open shifts compare the current schedule directly against coverage requirements.
  const openShifts = useMemo(() => {
    const pendingCoverageGapVolunteerRequests = shiftRequests.requests.filter(
      (request) =>
        request.type === "pickup" &&
        request.status === "pending_approval" &&
        request.targetEmpId == null &&
        request.parentRequestId == null,
    );

    return computeOpenShifts(
      focusAreas,
      assignments,
      coverageRequirements,
      publishedPeriodDates,
      activeEmployees,
      currentPeriodShifts,
      assignmentById,
      assignmentLabelMap,
      org.coverageRuleConfig,
      {
        now: currentTime,
        timeZone: org.timezone ?? null,
      },
    ).flatMap((openShift) => {
      const openShiftDate = formatDateKey(openShift.date);
      const matchingRequestIds = new Set<string>();

      for (const request of pendingCoverageGapVolunteerRequests) {
        if (request.requesterShiftDate !== openShiftDate) {
          continue;
        }
        if (request.requesterFocusAreaId !== openShift.focusAreaId) {
          continue;
        }

        if (
          request.requesterAssignmentDefinitionIds.some((assignmentId) =>
            openShift.eligibleAssignmentDefinitionIds.includes(assignmentId),
          )
        ) {
          matchingRequestIds.add(request.id);
        }
      }

      const remainingNeeded = openShift.needed - matchingRequestIds.size;

      return remainingNeeded > 0 ? [{ ...openShift, needed: remainingNeeded }] : [];
    });
  }, [
    focusAreas,
    assignments,
    coverageRequirements,
    publishedPeriodDates,
    activeEmployees,
    currentPeriodShifts,
    assignmentById,
    assignmentLabelMap,
    currentTime,
    org.coverageRuleConfig,
    org.timezone,
    shiftRequests.requests,
  ]);

  // Shift breakdown
  const shiftBreakdown = useMemo(
    () =>
      computeShiftBreakdown(
        currentPeriodShifts,
        assignmentById,
        shiftCategories,
        focusAreas,
        activeEmployees,
        assignmentLabelMap,
      ),
    [
      currentPeriodShifts,
      assignmentById,
      shiftCategories,
      focusAreas,
      activeEmployees,
      assignmentLabelMap,
    ],
  );

  // Activity feed
  const activityItems = useMemo(
    () => buildActivityFeed(activityPublishHistory, activityRequests, invitations, 100),
    [activityPublishHistory, activityRequests, invitations],
  );

  const trendData = useMemo(
    () =>
      computeCoverageTrendData(
        focusAreas,
        assignments,
        coverageRequirements,
        activeEmployees,
        allShifts,
        periodStart,
        periodDays,
        org.coverageRuleConfig,
      ),
    [
      focusAreas,
      assignments,
      coverageRequirements,
      activeEmployees,
      allShifts,
      periodStart,
      periodDays,
      org.coverageRuleConfig,
    ],
  );

  // ─── Draft counts ──────────────────────────────────────
  const { draftNewCount, draftModifiedCount, draftDeletedCount } = useMemo(() => {
    let newCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;
    for (const key of Object.keys(currentPeriodShifts)) {
      const shift = currentPeriodShifts[key];
      if (shift.isDraft) {
        if (shift.draftKind === "new") newCount++;
        else if (shift.draftKind === "modified") modifiedCount++;
        else if (shift.draftKind === "deleted") deletedCount++;
      }
    }
    return {
      draftNewCount: newCount,
      draftModifiedCount: modifiedCount,
      draftDeletedCount: deletedCount,
    };
  }, [currentPeriodShifts]);

  const openShiftSlotCount = openShifts.reduce((total, shift) => total + shift.needed, 0);
  const urgentGapCount = openShifts
    .filter((s) => s.urgency === "high")
    .reduce((total, shift) => total + shift.needed, 0);
  const draftTotal = draftNewCount + draftModifiedCount + draftDeletedCount;
  const coveragePct = periodStats.coverage?.pct ?? 100;
  const isCoverageUnpublished = publishedWindowState === "unpublished";
  const isCoveragePartial = publishedWindowState === "partial";
  const hasCoverageRequirements = coverageRequirements.length > 0;
  const showOT = permissions.canEditShifts;
  const heroSummary = useMemo(() => {
    if (urgentGapCount > 0) {
      return {
        statusLabel: "Urgent",
        title: `${urgentGapCount} urgent coverage gap${urgentGapCount === 1 ? "" : "s"}`,
        description: "Resolve the most critical staffing gaps before the next shift starts.",
        actionLabel: "Review schedule",
        actionHref: "/schedule",
      };
    }

    if (permissions.canApproveShiftRequests && shiftRequests.pendingApproval.length > 0) {
      return {
        statusLabel: "Approval",
        title: `${shiftRequests.pendingApproval.length} shift request${shiftRequests.pendingApproval.length === 1 ? "" : "s"} awaiting approval`,
        description: "Review pending requests and keep your schedule up to date.",
        actionLabel: "Review requests",
        actionHref: "/schedule",
      };
    }

    if (showOT && otAlerts.length > 0) {
      return {
        statusLabel: "Warning",
        title: `${otAlerts.length} projected overtime alert${otAlerts.length === 1 ? "" : "s"}`,
        description: "Adjust hours or staffing to avoid overtime this period.",
        actionLabel: "Review OT alerts",
        actionHref: "/schedule",
      };
    }

    if (draftTotal > 0) {
      return {
        statusLabel: "Drafts",
        title: `${draftTotal} unsaved schedule draft${draftTotal === 1 ? "" : "s"}`,
        description: "Finalize draft shifts before publishing them to your team.",
        actionLabel: "View drafts",
        actionHref: "/schedule",
      };
    }

    if (isCoverageUnpublished) {
      return {
        statusLabel: "Pending publish",
        title: "This period has not been published yet",
        description: hasCoverageRequirements
          ? "Coverage and open-gap metrics will appear after the first publish."
          : "Publish this period so the schedule is visible to your team.",
        actionLabel: "Open schedule",
        actionHref: "/schedule",
      };
    }

    if (!hasCoverageRequirements) {
      return {
        statusLabel: "Setup",
        title: "Coverage requirements not configured",
        description:
          "Set staffing requirements so coverage and open-gap tracking can surface here.",
        actionLabel: permissions.canManageCoverageRequirements
          ? "Configure coverage"
          : "Open schedule",
        actionHref: permissions.canManageCoverageRequirements
          ? "/settings?section=schedule-coverage"
          : "/schedule",
      };
    }

    if (coveragePct < 90) {
      return {
        statusLabel: "Coverage",
        title: "Coverage is below target",
        description: "There are still some sections with incomplete staffing this period.",
        actionLabel: "Review coverage",
        actionHref: "/schedule",
      };
    }

    return {
      statusLabel: "Healthy",
      title: "Schedule health looks good",
      description: "No major alert items detected. Keep reviewing your schedule and requests.",
      actionLabel: "Open schedule",
      actionHref: "/schedule",
    };
  }, [
    urgentGapCount,
    permissions.canApproveShiftRequests,
    permissions.canManageCoverageRequirements,
    shiftRequests.pendingApproval.length,
    showOT,
    otAlerts.length,
    draftTotal,
    isCoverageUnpublished,
    hasCoverageRequirements,
    coveragePct,
  ]);

  const heroMetrics = useMemo(() => {
    const coverageDetail = isCoverageUnpublished
      ? "Not published yet"
      : !hasCoverageRequirements
        ? "Not configured"
        : isCoveragePartial
          ? "Published dates only"
          : "Current staffing coverage";
    const openGapDetail = isCoverageUnpublished
      ? "Not published yet"
      : !hasCoverageRequirements
        ? "Not configured"
        : isCoveragePartial
          ? "Published dates only"
          : "Staffing gaps this period";
    const hideCoverageValue = isCoverageUnpublished || !hasCoverageRequirements;
    const metrics = [
      {
        label: "Coverage",
        value: hideCoverageValue ? "\u2014" : `${coveragePct}%`,
        detail: coverageDetail,
        href: "/schedule",
      },
      {
        label: "Open gaps",
        value: hideCoverageValue ? "\u2014" : `${openShiftSlotCount}`,
        detail: openGapDetail,
        href: "/schedule",
      },
      {
        label: "Draft shifts",
        value: `${draftTotal}`,
        detail: "Unpublished schedule changes",
        href: "/schedule",
      },
    ];

    if (permissions.canApproveShiftRequests) {
      metrics.splice(2, 0, {
        label: "Pending approvals",
        value: `${shiftRequests.pendingApproval.length}`,
        detail: "Requests waiting for review",
        href: "/schedule",
      });
    }

    return metrics;
  }, [
    coveragePct,
    hasCoverageRequirements,
    isCoveragePartial,
    isCoverageUnpublished,
    openShiftSlotCount,
    draftTotal,
    permissions.canApproveShiftRequests,
    shiftRequests.pendingApproval.length,
  ]);

  // ─── Render ─────────────────────────────────────────────
  // On a wide enough viewport the user dashboard becomes a fixed two-pane
  // layout: the page itself never scrolls, and each pane scrolls on its own.
  const userLockLayout = isUserDashboardMode && !isMobile && !isTablet;
  const contentStyle = {
    // In the locked layout each pane owns its scroll, so the outer padding is
    // dropped: content scrolls flush under the sticky header and runs to the
    // bottom edge. The panes carry their own padding (incl. horizontal, so card
    // borders/shadows aren't clipped by the scroll container's edge). A small
    // outer gutter keeps the panes off the very screen edge.
    paddingTop: userLockLayout ? 16 : isMobile ? 16 : isTablet ? 24 : 32,
    paddingRight: userLockLayout ? 24 : isMobile ? 16 : isTablet ? 24 : 40,
    paddingBottom: userLockLayout ? 0 : isMobile ? 16 : isTablet ? 24 : 32,
    // Flat 16px, matching Schedule's toolbar/grid padding and the header
    // logo on both pages (see Header.tsx's isFlatPaddingRoute).
    paddingLeft: 16,
    maxWidth: isUserDashboardMode ? 1560 : 1300,
    margin: "0 auto",
    width: "100%" as const,
    boxSizing: "border-box" as const,
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "var(--dg-space-xl)",
    ...(userLockLayout ? { flex: 1, minHeight: 0, overflow: "hidden" as const } : {}),
  };

  const headerProps = {
    periodStart,
    periodEnd,
    viewMode: effectiveViewMode,
    showViewModeTabs: true,
    availableViewModes: isUserDashboardMode ? (["week", "2weeks"] as ViewMode[]) : undefined,
    onPrev: handlePrev,
    onNext: handleNext,
    onToday: handleToday,
    onViewModeChange: handleViewModeChange,
  };

  if (shiftsLoading) {
    return (
      <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <div className="no-print" style={stickyBarStyle}>
          <div style={toolbarContainerStyle}>
            <DashboardHeader {...headerProps} />
          </div>
        </div>
        <div style={contentStyle}>
          <DashboardLoading />
        </div>
      </div>
    );
  }

  // ─── Shared props for role-specific dashboards ─────────
  const contentProps = {
    org,
    focusAreas,
    assignments,
    shiftCategories,
    jobs,
    coverageRequirements,
    assignmentLabelMap,
    assignmentById,
    employees,
    activeEmployees,
    permissions,
    viewMode: effectiveViewMode,
    periodDates,
    periodStart,
    periodEnd,
    periodLabel,
    prevPeriodLabel,
    currentPeriodShifts,
    allShifts,
    periodStats,
    sectionCoverage,
    openShifts,
    otAlerts,
    currentHours,
    prevHours,
    shiftBreakdown,
    activityItems,
    trendData,
    publishedWindowState,
    overtimeThreshold,
    shiftRequests,
    currentEmpId,
    currentEmployee,
    publishHistory,
    draftNewCount,
    draftModifiedCount,
    draftDeletedCount,
    absenceTypeById,
    isMobile,
    isTablet,
    onExpandPanel: handleExpandPanel,
  };

  let DashboardContent;
  if (dashboardRoleVariant === "super-admin") {
    DashboardContent = SuperAdminDashboard;
  } else if (dashboardRoleVariant === "admin") {
    DashboardContent = AdminDashboard;
  } else {
    DashboardContent = UserDashboard;
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        ...(userLockLayout
          ? {
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - var(--app-shell-header-h, 56px))",
              overflow: "hidden",
            }
          : {}),
      }}
    >
      {/* Sticky toolbar */}
      <div
        className="no-print"
        style={userLockLayout ? { ...toolbarContainerStyle, flexShrink: 0 } : stickyBarStyle}
      >
        {userLockLayout ? (
          <DashboardHeader {...headerProps} />
        ) : (
          <div style={toolbarContainerStyle}>
            <DashboardHeader {...headerProps} />
          </div>
        )}
      </div>

      {/* Content */}
      <div data-tour="dashboard-cards" style={contentStyle}>
        <DashboardGreeting
          name={currentEmployee?.firstName?.trim() || authUser?.email?.split("@")[0] || null}
          now={currentTime}
          userId={authUser?.id ?? null}
          orgTimezone={org.timezone ?? null}
          hasIncompleteWork={
            draftTotal > 0 ||
            (hasAdminCapability &&
              (focusAreas.length === 0 ||
                departments.length === 0 ||
                orgRoles.length === 0 ||
                certifications.length === 0 ||
                assignments.length === 0 ||
                employees.length === 0))
          }
        />

        {!isUserDashboardMode && (
          <DashboardHero
            headline={heroSummary.title}
            description={heroSummary.description}
            actionLabel={heroSummary.actionLabel}
            actionHref={heroSummary.actionHref}
            metrics={heroMetrics}
          />
        )}

        {/* Onboarding checklist — shown until all setup steps are complete */}
        {!isUserDashboardMode &&
          hasAdminCapability &&
          (() => {
            const setupSteps = [
              {
                done: focusAreas.length > 0,
                label: `Configure ${org.focusAreaLabel || "focus areas"}`,
                href: "/settings?section=staff-departments",
              },
              {
                done: departments.length > 0,
                label: "Add departments",
                href: "/settings?section=staff-departments",
              },
              {
                done: orgRoles.length > 0,
                label: `Add ${org.roleLabel || "roles"}`,
                href: "/settings?section=staff-roles",
              },
              {
                done: certifications.length > 0,
                label: `Add ${org.certificationLabel || "certifications"}`,
                href: "/settings?section=staff-certifications",
              },
              {
                done: assignments.length > 0,
                label: "Add shifts and jobs",
                href: "/settings?section=schedule-jobs",
              },
              {
                done: employees.length > 0,
                label: "Add employees",
                href: "/people",
              },
              {
                done: employees.length > 0 && assignments.length > 0,
                label: "Create your first schedule",
                href: "/schedule",
              },
            ];
            const allDone = setupSteps.every((s) => s.done);
            if (allDone) return null;
            return <DashboardChecklist steps={setupSteps} />;
          })()}

        {/* Users see a "setup in progress" message if no employee record */}
        {employees.length === 0 && !isUserDashboardMode && !hasAdminCapability && (
          <EmptyState
            heading="Your organization is being set up"
            description="Your administrator is configuring the organization. Check back soon."
          />
        )}

        {/* ─── Role-specific dashboard content ─────────────── */}
        <DashboardContent {...contentProps} />

        {/* ─── Expanded Panels (shared across all roles) ───── */}
        {expandedPanel === "stats" && (
          <ExpandedStats
            allShifts={allShifts}
            currentWeekStart={periodStart}
            periodDays={periodDays}
            activeEmployees={activeEmployees}
            focusAreas={focusAreas}
            assignments={assignments}
            assignmentById={assignmentById}
            shiftCategories={shiftCategories}
            coverageRequirements={coverageRequirements}
            categoryById={categoryById}
            showOT={showOT}
            hasRequirements={coverageRequirements.length > 0}
            overtimeThreshold={overtimeThreshold}
            coverageRuleConfig={org.coverageRuleConfig}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "coverage" && (
          <ExpandedCoverage
            sections={sectionCoverage}
            focusAreas={focusAreas}
            focusAreaLabel={org.focusAreaLabel || "section"}
            hasRequirements={coverageRequirements.length > 0}
            publishedWindowState={publishedWindowState}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "openShifts" && (
          <ExpandedOpenShifts
            openShifts={openShifts}
            publishedWindowState={publishedWindowState}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "staffHours" && (
          <ExpandedStaffHours
            currentHours={currentHours}
            prevHours={prevHours}
            employees={activeEmployees}
            focusAreas={focusAreas}
            canNavigateToDetailsPage={permissions.canManageEmployees}
            otThreshold={overtimeThreshold}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "breakdown" && (
          <ExpandedBreakdown breakdown={shiftBreakdown} onClose={closeExpanded} />
        )}
        {expandedPanel === "activity" && (
          <ExpandedActivity items={activityItems} onClose={closeExpanded} />
        )}
      </div>
    </div>
  );
}

const stickyBarStyle = {
  position: "sticky" as const,
  top: "var(--app-shell-header-h, 56px)",
  zIndex: 99,
  background: "var(--color-bg)",
};

const toolbarContainerStyle = {
  // Flat 16px, matching Schedule's toolbar and the header logo on both
  // pages (see Header.tsx's isFlatPaddingRoute).
  padding: "12px 16px 0",
  borderBottom: "1px solid var(--color-border)",
};
