"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthProvider";
import { useShiftRequests, useMediaQuery, MOBILE, TABLET } from "@/hooks";

import type { Permissions } from "@/hooks";
import type {
  Organization,
  FocusArea,
  ShiftCode,
  ShiftCategory,
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
  fetchInvitations,
  fetchShiftRequests,
} from "@/lib/db";
import { buildPublishedDateSet } from "@/lib/schedule-logic";
import {
  getWeekStart,
  getDatesInRange,
  addDays,
  formatDateKey,
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

export type ViewMode = "day" | "week" | "2weeks";

import DashboardHeader from "./DashboardHeader";
import UserDashboard from "./UserDashboard";
import AdminDashboard from "./AdminDashboard";
import SuperAdminDashboard from "./SuperAdminDashboard";
import { EmptyState } from "@/components/EmptyState";
import DashboardHero from "./DashboardHero";
import DashboardChecklist from "./DashboardChecklist";
import DashboardLoading from "./DashboardLoading";
const ExpandedStats = dynamic(() => import("./expanded/ExpandedStats"), {
  ssr: false,
});
const ExpandedCoverage = dynamic(() => import("./expanded/ExpandedCoverage"), {
  ssr: false,
});
const ExpandedOpenShifts = dynamic(
  () => import("./expanded/ExpandedOpenShifts"),
  { ssr: false },
);
const ExpandedStaffHours = dynamic(
  () => import("./expanded/ExpandedStaffHours"),
  { ssr: false },
);
const ExpandedBreakdown = dynamic(
  () => import("./expanded/ExpandedBreakdown"),
  { ssr: false },
);
const ExpandedActivity = dynamic(() => import("./expanded/ExpandedActivity"), {
  ssr: false,
});

type ExpandedPanel =
  | "stats"
  | "coverage"
  | "openShifts"
  | "staffHours"
  | "breakdown"
  | "activity"
  | null;

interface DashboardViewProps {
  org: Organization;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  coverageRequirements: CoverageRequirement[];
  shiftCodeMap: Map<number, string>;
  shiftCodeById: Map<number, ShiftCode>;
  absenceTypeMap: Map<number, string>;
  absenceTypes: AbsenceType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  departments: Department[];
  employees: Employee[];
  permissions: Permissions;
}

export default function DashboardView({
  org,
  focusAreas,
  shiftCodes,
  shiftCategories,
  coverageRequirements,
  shiftCodeMap,
  shiftCodeById,
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

  // ─── Expanded panel state ─────────────────────────────
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const closeExpanded = useCallback(() => setExpandedPanel(null), []);
  const handleExpandPanel = useCallback(
    (panel: string) => setExpandedPanel(panel as ExpandedPanel),
    [],
  );

  // ─── View mode + period navigation ─────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const periodDays = viewMode === "day" ? 1 : viewMode === "2weeks" ? 14 : 7;

  const [periodStart, setPeriodStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    // Snap to appropriate start when changing modes
    setPeriodStart((d) => (mode === "day" ? d : getWeekStart(d)));
  }, []);

  const periodEnd = useMemo(
    () => addDays(periodStart, periodDays - 1),
    [periodStart, periodDays],
  );
  const periodDates = useMemo(
    () => getDatesInRange(periodStart, periodDays),
    [periodStart, periodDays],
  );
  const prevPeriodStart = useMemo(
    () => addDays(periodStart, -periodDays),
    [periodStart, periodDays],
  );

  const periodStartKey = useMemo(
    () => formatDateKey(periodStart),
    [periodStart],
  );
  const periodEndKey = useMemo(() => formatDateKey(periodEnd), [periodEnd]);
  const prevPeriodStartKey = useMemo(
    () => formatDateKey(prevPeriodStart),
    [prevPeriodStart],
  );
  const prevPeriodEndKey = useMemo(
    () => formatDateKey(addDays(periodStart, -1)),
    [periodStart],
  );

  const periodDateKeys = useMemo(
    () => periodDates.map(formatDateKey),
    [periodDates],
  );
  const prevPeriodDateKeys = useMemo(
    () => getDatesInRange(prevPeriodStart, periodDays).map(formatDateKey),
    [prevPeriodStart, periodDays],
  );

  const prevPeriodLabel =
    viewMode === "day"
      ? "yesterday"
      : viewMode === "2weeks"
        ? "last 2 weeks"
        : "last week";

  const handlePrev = useCallback(
    () => setPeriodStart((d) => addDays(d, -periodDays)),
    [periodDays],
  );
  const handleNext = useCallback(
    () => setPeriodStart((d) => addDays(d, periodDays)),
    [periodDays],
  );
  const handleToday = useCallback(() => {
    const now = new Date();
    setPeriodStart(
      viewMode === "day"
        ? (() => {
            const d = new Date(now);
            d.setHours(0, 0, 0, 0);
            return d;
          })()
        : getWeekStart(now),
    );
  }, [viewMode]);

  // ─── Data fetching ──────────────────────────────────────
  const [allShifts, setAllShifts] = useState<ShiftMap>({});
  const [publishHistory, setPublishHistory] =
    useState<PublishHistoryEntry | null>(null);
  const [activityPublishHistory, setActivityPublishHistory] = useState<
    PublishHistoryEntryWithName[]
  >([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activityRequests, setActivityRequests] = useState<ShiftRequest[]>([]);
  const [publishedDateRanges, setPublishedDateRanges] = useState<
    { startDate: string; endDate: string }[]
  >([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  const orgId = org.id;
  const isScheduler = permissions.level >= 2 || permissions.canEditShifts;

  // Stable refs for Maps to avoid re-fetching on every render
  // (Map objects have no referential stability)
  const shiftCodeMapRef = useRef(shiftCodeMap);
  useEffect(() => {
    shiftCodeMapRef.current = shiftCodeMap;
  });
  const absenceTypeMapRef = useRef(absenceTypeMap);
  useEffect(() => {
    absenceTypeMapRef.current = absenceTypeMap;
  });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShiftsLoading(true);

    // Fetch only the date range needed: previous period start → current period end
    const fetchStart = formatDateKey(prevPeriodStart);
    const fetchEnd = formatDateKey(periodEnd);
    Promise.all([
      fetchShifts(
        orgId,
        isScheduler,
        shiftCodeMapRef.current,
        absenceTypeMapRef.current,
        fetchStart,
        fetchEnd,
      ),
      fetchPublishHistory(orgId, 20, 0).catch(() => []),
      fetchPublishedDateRanges(orgId, fetchStart, fetchEnd).catch(() => []),
      fetchInvitations(orgId).catch(() => []),
      fetchShiftRequests(orgId, shiftCodeMapRef.current).catch(() => []),
    ])
      .then(([shifts, publishRows, pubDateRanges, invitationRows, requestRows]) => {
        if (cancelled) return;
        setAllShifts(shifts);
        setPublishHistory(publishRows[0] ?? null);
        setActivityPublishHistory(publishRows);
        setPublishedDateRanges(pubDateRanges);
        setInvitations(invitationRows);
        setActivityRequests(requestRows);
        setShiftsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setShiftsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, isScheduler, prevPeriodStart, periodEnd]);

  // Shift requests
  const currentEmpId = useMemo(
    () =>
      authUser
        ? (employees.find((e) => e.userId === authUser.id)?.id ?? null)
        : null,
    [employees, authUser],
  );

  const currentEmployee = useMemo(
    () =>
      currentEmpId ? employees.find((e) => e.id === currentEmpId) : undefined,
    [employees, currentEmpId],
  );

  const shiftRequests = useShiftRequests(
    orgId,
    shiftCodeMap,
    currentEmpId,
    permissions.canApproveShiftRequests,
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
        shiftCodeById,
        40,
        categoryById,
      ),
    [
      activeEmployees,
      periodDateKeys,
      currentPeriodShifts,
      shiftCodeById,
      categoryById,
    ],
  );

  const prevHours = useMemo(
    () =>
      computeAllEmployeeHours(
        activeEmployees,
        prevPeriodDateKeys,
        prevPeriodShifts,
        shiftCodeById,
        40,
        categoryById,
      ),
    [
      activeEmployees,
      prevPeriodDateKeys,
      prevPeriodShifts,
      shiftCodeById,
      categoryById,
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
        periodDates,
        currentPeriodShifts,
        activeEmployees,
        coverageRequirements,
        shiftCodes,
      ),
    [
      focusAreas,
      periodDates,
      currentPeriodShifts,
      activeEmployees,
      coverageRequirements,
      shiftCodes,
    ],
  );

  // Stat cards
  const periodStats = useMemo(() => {
    const currentCoverage = coverageFromSections(sectionCoverage);
    const prevPeriodDates = getDatesInRange(prevPeriodStart, periodDays);
    const prevCoverage = computeCoveragePctAndSlots(
      focusAreas,
      shiftCodes,
      coverageRequirements,
      prevPeriodDates,
      activeEmployees,
      prevPeriodShifts,
    );

    return computeWeeklyStats(
      {
        shiftCount: countShifts(currentPeriodShifts, shiftCodeById),
        coveragePct: currentCoverage.pct,
        openSlots: currentCoverage.openSlots,
        staffScheduled: countStaffScheduled(currentPeriodShifts, shiftCodeById),
        otCount: otAlerts.length,
      },
      {
        shiftCount: countShifts(prevPeriodShifts, shiftCodeById),
        coveragePct: prevCoverage.pct,
        staffScheduled: countStaffScheduled(prevPeriodShifts, shiftCodeById),
        otCount: prevOtCount,
      },
      activeEmployees.length,
    );
  }, [
    sectionCoverage,
    currentPeriodShifts,
    prevPeriodShifts,
    shiftCodeById,
    focusAreas,
    shiftCodes,
    coverageRequirements,
    prevPeriodStart,
    periodDays,
    activeEmployees,
    otAlerts.length,
    prevOtCount,
  ]);

  // Dates that have been published at least once — coverage-gap open shifts
  // are only shown for these dates.
  const publishedDates = useMemo(
    () => buildPublishedDateSet(publishedDateRanges),
    [publishedDateRanges],
  );

  // Open shifts (filtered to only include published dates)
  const openShifts = useMemo(
    () =>
      computeOpenShifts(
        focusAreas,
        shiftCodes,
        coverageRequirements,
        periodDates,
        activeEmployees,
        currentPeriodShifts,
        shiftCodeById,
        shiftCodeMap,
      ).filter((s) => publishedDates.has(formatDateKey(s.date))),
    [
      focusAreas,
      shiftCodes,
      coverageRequirements,
      periodDates,
      activeEmployees,
      currentPeriodShifts,
      shiftCodeById,
      shiftCodeMap,
      publishedDates,
    ],
  );

  // Shift breakdown
  const shiftBreakdown = useMemo(
    () =>
      computeShiftBreakdown(
        currentPeriodShifts,
        shiftCodeById,
        shiftCategories,
        focusAreas,
        activeEmployees,
        shiftCodeMap,
      ),
    [
      currentPeriodShifts,
      shiftCodeById,
      shiftCategories,
      focusAreas,
      activeEmployees,
      shiftCodeMap,
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
        shiftCodes,
        coverageRequirements,
        activeEmployees,
        allShifts,
        periodStart,
        periodDays,
      ),
    [
      focusAreas,
      shiftCodes,
      coverageRequirements,
      activeEmployees,
      allShifts,
      periodStart,
      periodDays,
    ],
  );

  // ─── Draft counts ──────────────────────────────────────
  const { draftNewCount, draftModifiedCount, draftDeletedCount } =
    useMemo(() => {
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

  const urgentGapCount = openShifts.filter((s) => s.urgency === "high").length;
  const draftTotal = draftNewCount + draftModifiedCount + draftDeletedCount;
  const coveragePct = periodStats.coverage?.pct ?? 100;
  const showOT = permissions.canEditShifts;
  const heroSummary = useMemo(() => {
    if (urgentGapCount > 0) {
      return {
        statusLabel: "Urgent",
        title: `${urgentGapCount} urgent coverage gap${urgentGapCount === 1 ? "" : "s"}`,
        description:
          "Resolve the most critical staffing gaps before the next shift starts.",
        actionLabel: "Review schedule",
        actionHref: "/schedule",
      };
    }

    if (
      permissions.canApproveShiftRequests &&
      shiftRequests.pendingApproval.length > 0
    ) {
      return {
        statusLabel: "Approval",
        title: `${shiftRequests.pendingApproval.length} shift request${shiftRequests.pendingApproval.length === 1 ? "" : "s"} awaiting approval`,
        description:
          "Review pending requests and keep your schedule up to date.",
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
        description:
          "Finalize draft shifts before publishing them to your team.",
        actionLabel: "View drafts",
        actionHref: "/schedule",
      };
    }

    if (coveragePct < 90) {
      return {
        statusLabel: "Coverage",
        title: "Coverage is below target",
        description:
          "There are still some sections with incomplete staffing this period.",
        actionLabel: "Review coverage",
        actionHref: "/schedule",
      };
    }

    return {
      statusLabel: "Healthy",
      title: "Schedule health looks good",
      description:
        "No major alert items detected. Keep reviewing your schedule and requests.",
      actionLabel: "Open schedule",
      actionHref: "/schedule",
    };
  }, [
    urgentGapCount,
    permissions.canApproveShiftRequests,
    shiftRequests.pendingApproval.length,
    showOT,
    otAlerts.length,
    draftTotal,
    coveragePct,
  ]);

  const heroMetrics = useMemo(() => {
    const metrics = [
      {
        label: "Coverage",
        value: `${coveragePct}%`,
        detail: "Current staffing coverage",
      },
      {
        label: "Open gaps",
        value: `${openShifts.length}`,
        detail: "Staffing gaps this period",
      },
      {
        label: "Draft shifts",
        value: `${draftTotal}`,
        detail: "Unpublished schedule changes",
      },
    ];

    if (permissions.canApproveShiftRequests) {
      metrics.splice(2, 0, {
        label: "Pending approvals",
        value: `${shiftRequests.pendingApproval.length}`,
        detail: "Requests waiting for review",
      });
    }

    return metrics;
  }, [
    coveragePct,
    openShifts.length,
    draftTotal,
    permissions.canApproveShiftRequests,
    shiftRequests.pendingApproval.length,
  ]);

  // ─── Render ─────────────────────────────────────────────
  const contentStyle = {
    padding: isMobile ? "16px" : isTablet ? "24px" : "32px 40px",
    maxWidth: 1300,
    margin: "0 auto",
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "var(--dg-space-xl)",
  };

  const headerProps = {
    periodStart,
    periodEnd,
    viewMode,
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
    shiftCodes,
    shiftCategories,
    coverageRequirements,
    shiftCodeMap,
    shiftCodeById,
    employees,
    activeEmployees,
    permissions,
    viewMode,
    periodDates,
    periodStart,
    periodEnd,
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

  // ─── Pick role-specific layout ─────────────────────────

  // Department-permissioned users (level 0 but with admin-like permissions)
  // should see the admin dashboard if they have any management capability.
  const hasAdminCapability =
    permissions.level >= 2 ||
    permissions.canManageOrg ||
    permissions.canEditShifts ||
    permissions.canManageEmployees ||
    permissions.canViewDashboardAnalytics;

  let DashboardContent;
  if (permissions.level >= 3) {
    DashboardContent = SuperAdminDashboard;
  } else if (hasAdminCapability) {
    DashboardContent = AdminDashboard;
  } else {
    DashboardContent = UserDashboard;
  }

  return (
    <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
      {/* Sticky toolbar */}
      <div className="no-print" style={stickyBarStyle}>
        <div style={toolbarContainerStyle}>
          <DashboardHeader {...headerProps} />
        </div>
      </div>

      {/* Content */}
      <div data-tour="dashboard-cards" style={contentStyle}>
        <DashboardHero
          headline={heroSummary.title}
          description={heroSummary.description}
          actionLabel={heroSummary.actionLabel}
          actionHref={heroSummary.actionHref}
          metrics={heroMetrics}
        />

        {/* Onboarding checklist — shown until all setup steps are complete */}
        {hasAdminCapability &&
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
                done: shiftCodes.length > 0,
                label: "Add shift codes",
                href: "/settings?section=schedule-codes",
              },
              {
                done: employees.length > 0,
                label: "Add employees",
                href: "/people",
              },
              {
                done: employees.length > 0 && shiftCodes.length > 0,
                label: "Create your first schedule",
                href: "/schedule",
              },
            ];
            const allDone = setupSteps.every((s) => s.done);
            if (allDone) return null;
            return <DashboardChecklist steps={setupSteps} />;
          })()}

        {/* Users see a "setup in progress" message if no employee record */}
        {employees.length === 0 && !hasAdminCapability && (
          <EmptyState
            heading="Your workspace is being set up"
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
            shiftCodes={shiftCodes}
            shiftCodeById={shiftCodeById}
            shiftCategories={shiftCategories}
            coverageRequirements={coverageRequirements}
            categoryById={categoryById}
            showOT={showOT}
            hasRequirements={coverageRequirements.length > 0}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "coverage" && (
          <ExpandedCoverage
            sections={sectionCoverage}
            focusAreas={focusAreas}
            focusAreaLabel={org.focusAreaLabel || "section"}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "openShifts" && (
          <ExpandedOpenShifts openShifts={openShifts} onClose={closeExpanded} />
        )}
        {expandedPanel === "staffHours" && (
          <ExpandedStaffHours
            currentHours={currentHours}
            prevHours={prevHours}
            employees={activeEmployees}
            focusAreas={focusAreas}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "breakdown" && (
          <ExpandedBreakdown
            breakdown={shiftBreakdown}
            onClose={closeExpanded}
          />
        )}
        {expandedPanel === "activity" && (
          <ExpandedActivity
            items={activityItems}
            onClose={closeExpanded}
          />
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
  padding: "12px 16px 0",
  borderBottom: "1px solid var(--color-border)",
};
