"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthProvider";
import { useShiftRequests, useMediaQuery, MOBILE, TABLET } from "@/hooks";

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
  PublishHistoryEntryWithName,
  NamedItem,
  Department,
  ShiftRequest,
} from "@/types";
import {
  fetchShifts,
  fetchPublishHistory,
  fetchPublishedDateRanges,
  fetchShiftRequests,
} from "@/features/schedule/client";
import {
  buildPublishedDateSet,
  filterPublishedDates,
  getPublishedWindowState,
} from "@/lib/schedule-logic";
import type { PublishedWindowState } from "@/lib/schedule-logic";
import {
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
  computeOpenShifts,
  computeShiftBreakdown,
  buildActivityFeed,
  computeCoverageTrendData,
} from "@/lib/dashboard-stats";
import { getScheduleStartForSpan, realignTwoWeekScheduleStart } from "@/lib/schedule-view";
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
import { useDashboardInvitations } from "./useDashboardInvitations";
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
  assignmentNameMap: Map<number, string>;
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

export interface DashboardHeroMetric {
  label: string;
  value: string;
  detail?: string;
  href: string;
}

/**
 * The hero stat tiles, in display order.
 *
 * Coverage and Open gaps render an em-dash placeholder when the period has no
 * published data or no requirements configured, because a zero there would read
 * as "fully staffed" rather than "nothing to measure". Draft shifts and Pending
 * approvals are omitted outright instead, since a viewer without the matching
 * permission cannot act on the number or see what it refers to.
 */
export function buildDashboardHeroMetrics(input: {
  coveragePct: number;
  hasCoverageRequirements: boolean;
  isCoveragePartial: boolean;
  isCoverageUnpublished: boolean;
  openShiftSlotCount: number;
  draftTotal: number;
  pendingApprovalCount: number;
  canEditShifts: boolean;
  canApproveShiftRequests: boolean;
}): DashboardHeroMetric[] {
  // A caption is only worth the row when it says something the number cannot.
  // These three qualify because they explain an em dash or a partial figure; a
  // measured percentage gets none, since restating the label under the value
  // just repeats the tile back to the reader.
  const coverageCaveat = input.isCoverageUnpublished
    ? "Not published yet"
    : !input.hasCoverageRequirements
      ? "Not configured"
      : input.isCoveragePartial
        ? "Published dates only"
        : undefined;
  const hideCoverageValue = input.isCoverageUnpublished || !input.hasCoverageRequirements;
  const metrics: DashboardHeroMetric[] = [
    {
      label: "Coverage",
      value: hideCoverageValue ? "\u2014" : `${input.coveragePct}%`,
      detail: coverageCaveat,
      href: "/schedule",
    },
    {
      label: "Open gaps",
      value: hideCoverageValue ? "\u2014" : `${input.openShiftSlotCount}`,
      detail: coverageCaveat,
      href: "/schedule",
    },
  ];

  // The schedule API redacts drafts from anyone who can't edit shifts, so this
  // tile would always read 0 for them. Drop it rather than report a zero they
  // can neither act on nor verify.
  if (input.canEditShifts) {
    metrics.push({
      label: "Draft shifts",
      value: `${input.draftTotal}`,
      href: "/schedule",
    });
  }

  if (input.canApproveShiftRequests) {
    metrics.splice(2, 0, {
      label: "Pending approvals",
      value: `${input.pendingApprovalCount}`,
      href: "/schedule",
    });
  }

  return metrics;
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
  assignmentNameMap,
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

  // The expanded panels below render on sectionCoverage/shiftBreakdown/etc.,
  // which are stubbed empty in user mode (see those useMemos). UserDashboard
  // never opens one, but a panel left open from before a mid-session switch
  // into user mode (e.g. an admin toggling "View as User") would otherwise
  // keep rendering on that now-empty data instead of closing.
  useEffect(() => {
    if (isUserDashboardMode) {
      setExpandedPanel(null);
    }
  }, [isUserDashboardMode]);

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
      // Same shared Sunday-week-start math "2 weeks" mode uses above (span 1
      // always resolves to it regardless of payPeriodStartDate), instead of a
      // second, independently-maintained local implementation.
      return getScheduleStartForSpan({ date, span: 1, payPeriodStartDate });
    },
    [payPeriodStartDate],
  );

  const [periodStart, setPeriodStart] = useState<Date>(() =>
    getScheduleStartForSpan({ date: new Date(), span: 1, payPeriodStartDate: null }),
  );
  useEffect(() => {
    if (effectiveViewMode !== "2weeks") return;
    setPeriodStart((current) => realignTwoWeekScheduleStart(current, 2, payPeriodStartDate));
  }, [effectiveViewMode, payPeriodStartDate]);
  const currentTime = useMinuteNow();
  // Day-granular "today" key: changes only at midnight, so it can drive the
  // fetch window / hero look-ahead without re-running every minute.
  const todayKey = formatDateKey(currentTime);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      // Day mode has no "which day within the period" concept the way
      // week/2weeks do — mobile's Day view has no period-navigation state at
      // all and always resolves to today. Re-aligning the *current*
      // periodStart (e.g. the currently-viewed week's Sunday) to day
      // granularity would silently land on a different calendar day than
      // mobile's Day view whenever that's not today, showing unrelated
      // numbers for what looks like the same view. So switching into "day"
      // always jumps to today, matching mobile and the "Today" button.
      // Week/2weeks still re-align the current periodStart to the new
      // granularity's boundary, preserving browsing context.
      setPeriodStart((d) =>
        mode === "day" ? alignPeriodStart(new Date(), "day") : alignPeriodStart(d, mode),
      );
    },
    [alignPeriodStart],
  );

  const periodEnd = useMemo(() => addDays(periodStart, periodDays - 1), [periodStart, periodDays]);
  const periodDates = useMemo(
    () => getDatesInRange(periodStart, periodDays),
    [periodStart, periodDays],
  );
  const myScheduleStart = useMemo(
    () => (effectiveViewMode === "day" ? alignPeriodStart(periodStart, "week") : periodStart),
    [alignPeriodStart, effectiveViewMode, periodStart],
  );
  const myScheduleEnd = useMemo(
    () => addDays(myScheduleStart, effectiveViewMode === "2weeks" ? 13 : 6),
    [effectiveViewMode, myScheduleStart],
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
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntryWithName | null>(null);
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

  const invitations = useDashboardInvitations(orgId, !isUserDashboardMode);

  // Stable refs for Maps to avoid re-fetching on every render
  // (Map objects have no referential stability)
  const assignmentLabelMapRef = useLatestRef(assignmentLabelMap);
  const absenceTypeMapRef = useLatestRef(absenceTypeMap);

  useEffect(() => {
    let cancelled = false;
    setShiftsLoading(true);

    // Fetch the date range needed: previous period start → current period end.
    // On the user dashboard the window is widened to always cover
    // [today, today + HERO_LOOKAHEAD_DAYS] as well, so the hero can surface the
    // next upcoming shift even when it falls outside the period being browsed.
    const today = new Date(`${todayKey}T00:00:00`);
    const lookaheadEnd = addDays(today, HERO_LOOKAHEAD_DAYS);
    const earliestDashboardDate =
      myScheduleStart < prevPeriodStart ? myScheduleStart : prevPeriodStart;
    const latestDashboardDate = myScheduleEnd > periodEnd ? myScheduleEnd : periodEnd;
    const fetchStart = formatDateKey(
      isUserDashboardMode && today < earliestDashboardDate ? today : earliestDashboardDate,
    );
    const fetchEnd = formatDateKey(
      isUserDashboardMode && lookaheadEnd > latestDashboardDate
        ? lookaheadEnd
        : latestDashboardDate,
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
      // Widened to cover the previous period too, so the previous-period
      // coverage % can apply the same published-date filter as the current
      // period instead of comparing an unfiltered range against a filtered one.
      fetchPublishedDateRanges(orgId, prevPeriodStartKey, periodEndKey).catch(() => []),
      // Period-scoped (overlap with the selected window) to match mobile's
      // Activity Feed, instead of "most recent 20 publishes regardless of
      // what period they cover."
      //
      // Skipped on the user dashboard: the Activity Feed and the publish
      // banner it feeds are both admin-only, so staff were being handed an
      // audit trail of who published what purely to discard it.
      isUserDashboardMode
        ? Promise.resolve([])
        : fetchPublishHistory(orgId, 100, 0, {
            startDate: periodStartKey,
            endDate: periodEndKey,
          }).catch(() => []),
      // Period-scoped for the Activity Feed, matching mobile's date-bounded
      // request fetch — separate from the `shiftRequests` hook above, which
      // is also now period-scoped but drives Pending Approvals, not the feed.
      fetchShiftRequests(orgId, assignmentLabelMapRef.current, {
        startDate: periodStartKey,
        endDate: periodEndKey,
      }).catch(() => []),
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
    myScheduleEnd,
    myScheduleStart,
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
    // Period-scoped to match mobile's Pending Approvals/Activity Feed
    // semantics instead of an org-wide, unbounded fetch.
    { startDate: periodStartKey, endDate: periodEndKey },
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
  const prevPeriodDatesRange = useMemo(
    () => getDatesInRange(prevPeriodStart, periodDays),
    [prevPeriodStart, periodDays],
  );
  // Mirrors publishedPeriodDates above so the previous period's coverage %
  // (used for the week-over-week delta) applies the same published-date
  // filter as the current period instead of comparing filtered vs unfiltered.
  const publishedPrevPeriodDates = useMemo(
    () =>
      coverageRequirements.length === 0
        ? prevPeriodDatesRange
        : filterPublishedDates(prevPeriodDatesRange, publishedDateSet),
    [coverageRequirements.length, prevPeriodDatesRange, publishedDateSet],
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

  // Admin/super-admin only (staff-hours expanded panel + weekly stat deltas);
  // UserDashboard never opens either, so skip the per-employee pass entirely.
  const prevHours = useMemo(
    () =>
      isUserDashboardMode
        ? []
        : computeAllEmployeeHours(
            activeEmployees,
            prevPeriodDateKeys,
            prevPeriodShifts,
            assignmentById,
            overtimeThreshold,
            categoryById,
          ),
    [
      isUserDashboardMode,
      activeEmployees,
      prevPeriodDateKeys,
      prevPeriodShifts,
      assignmentById,
      categoryById,
      overtimeThreshold,
    ],
  );

  // OT alerts — admin/super-admin only (weekly stat card + expanded panels).
  const otAlerts = useMemo(
    () => (isUserDashboardMode ? [] : computeOTAlerts(currentHours, activeEmployees, focusAreas)),
    [isUserDashboardMode, currentHours, activeEmployees, focusAreas],
  );

  const prevOtCount = useMemo(
    () =>
      isUserDashboardMode ? 0 : computeOTAlerts(prevHours, activeEmployees, focusAreas).length,
    [isUserDashboardMode, prevHours, activeEmployees, focusAreas],
  );

  // Coverage by section — admin/super-admin only (UserDashboard never renders
  // DashboardHero, the coverage stat card, or the coverage expanded panel).
  const coverageResult = useMemo(
    () =>
      isUserDashboardMode
        ? { sections: [], totals: { totalRequired: 0, totalFilled: 0, pct: 100, openSlots: 0 } }
        : computeCoverageBySection(
            focusAreas,
            publishedPeriodDates,
            currentPeriodShifts,
            activeEmployees,
            coverageRequirements,
            assignments,
            shiftCategories,
            org.coverageRuleConfig,
          ),
    [
      isUserDashboardMode,
      focusAreas,
      publishedPeriodDates,
      currentPeriodShifts,
      activeEmployees,
      coverageRequirements,
      assignments,
      shiftCategories,
      org.coverageRuleConfig,
    ],
  );
  const sectionCoverage = coverageResult.sections;

  // Stat cards — admin/super-admin only. coverageResult.totals is already the
  // 100%-empty default in user mode, so currentCoverage falls out cheap; skip
  // the second full coverage pass for the previous period too.
  const periodStats = useMemo(() => {
    const currentCoverage = coverageResult.totals;
    const prevCoverage = isUserDashboardMode
      ? { pct: 100, openSlots: 0 }
      : computeCoveragePctAndSlots(
          focusAreas,
          assignments,
          coverageRequirements,
          publishedPrevPeriodDates,
          activeEmployees,
          prevPeriodShifts,
          shiftCategories,
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
    isUserDashboardMode,
    coverageResult,
    currentPeriodShifts,
    prevPeriodShifts,
    assignmentById,
    focusAreas,
    assignments,
    coverageRequirements,
    publishedPrevPeriodDates,
    activeEmployees,
    otAlerts.length,
    prevOtCount,
    shiftCategories,
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
      assignmentNameMap,
      shiftCategories,
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
    assignmentNameMap,
    shiftCategories,
    currentTime,
    org.coverageRuleConfig,
    org.timezone,
    shiftRequests.requests,
  ]);

  // Shift breakdown — admin/super-admin only (breakdown expanded panel).
  const shiftBreakdown = useMemo(
    () =>
      isUserDashboardMode
        ? { byFocusArea: [], totalShifts: 0 }
        : computeShiftBreakdown(
            currentPeriodShifts,
            assignmentById,
            shiftCategories,
            focusAreas,
            activeEmployees,
            assignmentNameMap,
          ),
    [
      isUserDashboardMode,
      currentPeriodShifts,
      assignmentById,
      shiftCategories,
      focusAreas,
      activeEmployees,
      assignmentNameMap,
    ],
  );

  // Period-scoped for the Activity Feed, matching mobile's date-bounded
  // accepted_at filter. `invitations` itself stays the full org-wide,
  // unbounded fetch (react-query cache shared with People/Members pages,
  // which need the complete list), so this only filters the feed's input.
  const periodScopedInvitations = useMemo(
    () =>
      invitations.filter((invitation) => {
        if (!invitation.acceptedAt) return false;
        const acceptedDateKey = formatDateKey(new Date(invitation.acceptedAt));
        return acceptedDateKey >= periodStartKey && acceptedDateKey <= periodEndKey;
      }),
    [invitations, periodStartKey, periodEndKey],
  );

  // Activity feed — admin/super-admin only (activity expanded panel).
  const activityItems = useMemo(
    () =>
      isUserDashboardMode
        ? []
        : buildActivityFeed(activityPublishHistory, activityRequests, periodScopedInvitations, 100),
    [isUserDashboardMode, activityPublishHistory, activityRequests, periodScopedInvitations],
  );

  // Coverage trend — admin/super-admin only. Recomputes a full coverage
  // snapshot for 5 historical periods, so skipping it in user mode avoids
  // 5x the work of sectionCoverage above for a value UserDashboard never reads.
  const trendData = useMemo(
    () =>
      isUserDashboardMode
        ? []
        : computeCoverageTrendData(
            focusAreas,
            assignments,
            coverageRequirements,
            activeEmployees,
            allShifts,
            periodStart,
            periodDays,
            shiftCategories,
            org.coverageRuleConfig,
          ),
    [
      isUserDashboardMode,
      focusAreas,
      assignments,
      coverageRequirements,
      activeEmployees,
      allShifts,
      periodStart,
      periodDays,
      shiftCategories,
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
  // Only true when this user can actually act on an incomplete org setup
  // checklist — gates the DashboardGreeting "let's get you set up" copy so
  // it never shows to a non-admin, or an admin with nothing left to set up.
  const needsOrgSetup =
    hasAdminCapability &&
    (focusAreas.length === 0 ||
      departments.length === 0 ||
      orgRoles.length === 0 ||
      certifications.length === 0 ||
      assignments.length === 0 ||
      employees.length === 0);
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

  const heroMetrics = useMemo(
    () =>
      buildDashboardHeroMetrics({
        coveragePct,
        hasCoverageRequirements,
        isCoveragePartial,
        isCoverageUnpublished,
        openShiftSlotCount,
        draftTotal,
        pendingApprovalCount: shiftRequests.pendingApproval.length,
        canEditShifts: permissions.canEditShifts,
        canApproveShiftRequests: permissions.canApproveShiftRequests,
      }),
    [
      coveragePct,
      hasCoverageRequirements,
      isCoveragePartial,
      isCoverageUnpublished,
      openShiftSlotCount,
      draftTotal,
      permissions.canEditShifts,
      permissions.canApproveShiftRequests,
      shiftRequests.pendingApproval.length,
    ],
  );

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
    paddingBottom: userLockLayout ? 0 : isMobile ? 16 : isTablet ? 24 : 32,
    // The canonical page gutter, shared with the header logo and every other
    // page so the logo stays put across routes (see globals.css).
    paddingLeft: "var(--dg-page-gutter)",
    paddingRight: "var(--dg-page-gutter)",
    maxWidth: 1560,
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
    // Admin/super-admin only — UserDashboard never computes trendData.
    onViewTrends: isUserDashboardMode ? undefined : () => handleExpandPanel("stats"),
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
    assignmentNameMap,
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
              height: "calc(100vh - var(--dg-app-shell-header-height))",
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
          hasIncompleteWork={draftTotal > 0 || needsOrgSetup}
          needsSetup={needsOrgSetup}
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
  top: "var(--dg-app-shell-header-height)",
  zIndex: 99,
  background: "var(--dg-color-bg)",
};

const toolbarContainerStyle = {
  // Horizontally on the canonical page gutter, like Schedule's toolbar and
  // the header logo (see globals.css).
  padding: "12px var(--dg-page-gutter) 0",
  borderBottom: "1px solid var(--dg-color-border)",
};
