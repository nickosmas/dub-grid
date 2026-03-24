"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
  ShiftMap,
  PublishHistoryEntry,
} from "@/types";
import { fetchShifts, fetchLatestPublishHistory } from "@/lib/db";
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
} from "@/lib/dashboard-stats";

export type ViewMode = "day" | "week" | "2weeks";

import DashboardHeader from "./DashboardHeader";
import AlertBanner from "./AlertBanner";
import StatCardsRow from "./StatCardsRow";
import CoverageBySectionCard from "./CoverageBySectionCard";
import OpenShiftsCard from "./OpenShiftsCard";
import StaffHoursCard from "./StaffHoursCard";
import ShiftBreakdownCard from "./ShiftBreakdownCard";
import ActivityFeed from "./ActivityFeed";
import ExpandedStats from "./expanded/ExpandedStats";
import ExpandedCoverage from "./expanded/ExpandedCoverage";
import ExpandedOpenShifts from "./expanded/ExpandedOpenShifts";
import ExpandedStaffHours from "./expanded/ExpandedStaffHours";
import ExpandedBreakdown from "./expanded/ExpandedBreakdown";
import ExpandedActivity from "./expanded/ExpandedActivity";

type ExpandedPanel = "stats" | "coverage" | "openShifts" | "staffHours" | "breakdown" | "activity" | null;

interface DashboardViewProps {
  org: Organization;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  coverageRequirements: CoverageRequirement[];
  shiftCodeMap: Map<number, string>;
  shiftCodeById: Map<number, ShiftCode>;
  employees: Employee[];
  benchedCount: number;
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
  employees,
  benchedCount,
  permissions,
}: DashboardViewProps) {
  const { user: authUser } = useAuth();
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);

  // ─── Expanded panel state ─────────────────────────────
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const closeExpanded = useCallback(() => setExpandedPanel(null), []);

  // ─── View mode + period navigation ─────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const periodDays = viewMode === "day" ? 1 : viewMode === "2weeks" ? 14 : 7;

  const [periodStart, setPeriodStart] = useState<Date>(() => getWeekStart(new Date()));

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    // Snap to appropriate start when changing modes
    setPeriodStart((d) => (mode === "day" ? d : getWeekStart(d)));
  }, []);

  const periodEnd = useMemo(() => addDays(periodStart, periodDays - 1), [periodStart, periodDays]);
  const periodDates = useMemo(() => getDatesInRange(periodStart, periodDays), [periodStart, periodDays]);
  const prevPeriodStart = useMemo(() => addDays(periodStart, -periodDays), [periodStart, periodDays]);

  const periodStartKey = useMemo(() => formatDateKey(periodStart), [periodStart]);
  const periodEndKey = useMemo(() => formatDateKey(periodEnd), [periodEnd]);
  const prevPeriodStartKey = useMemo(() => formatDateKey(prevPeriodStart), [prevPeriodStart]);
  const prevPeriodEndKey = useMemo(() => formatDateKey(addDays(periodStart, -1)), [periodStart]);

  const periodDateKeys = useMemo(() => periodDates.map(formatDateKey), [periodDates]);
  const prevPeriodDateKeys = useMemo(
    () => getDatesInRange(prevPeriodStart, periodDays).map(formatDateKey),
    [prevPeriodStart, periodDays],
  );

  const prevPeriodLabel = viewMode === "day" ? "yesterday" : viewMode === "2weeks" ? "last 2 weeks" : "last week";

  const handlePrev = useCallback(() => setPeriodStart((d) => addDays(d, -periodDays)), [periodDays]);
  const handleNext = useCallback(() => setPeriodStart((d) => addDays(d, periodDays)), [periodDays]);
  const handleToday = useCallback(() => {
    const now = new Date();
    setPeriodStart(viewMode === "day" ? (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; })() : getWeekStart(now));
  }, [viewMode]);

  // ─── Data fetching ──────────────────────────────────────
  const [allShifts, setAllShifts] = useState<ShiftMap>({});
  const [publishHistory, setPublishHistory] = useState<PublishHistoryEntry | null>(null);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  const orgId = org.id;
  const isScheduler = permissions.level >= 2;

  // Stable ref for shiftCodeMap to avoid re-fetching on every render
  // (Map objects have no referential stability)
  const shiftCodeMapRef = useRef(shiftCodeMap);
  shiftCodeMapRef.current = shiftCodeMap;

  useEffect(() => {
    let cancelled = false;
    setShiftsLoading(true);

    Promise.all([
      fetchShifts(orgId, isScheduler, shiftCodeMapRef.current),
      fetchLatestPublishHistory(orgId),
    ]).then(([shifts, pub]) => {
      if (cancelled) return;
      setAllShifts(shifts);
      setPublishHistory(pub);
      setShiftsLoading(false);
    }).catch(() => {
      if (!cancelled) setShiftsLoading(false);
    });

    return () => { cancelled = true; };
  }, [orgId, isScheduler]);

  // Shift requests
  const currentEmpId = useMemo(
    () => (authUser ? employees.find((e) => e.userId === authUser.id)?.id ?? null : null),
    [employees, authUser],
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

  // Break-aware hour computation maps
  const categoryById = useMemo(
    () => new Map(shiftCategories.map((c) => [c.id, c])),
    [shiftCategories],
  );
  const focusAreaById = useMemo(
    () => new Map(focusAreas.map((fa) => [fa.id, fa])),
    [focusAreas],
  );

  // Employee hours (current + prev period)
  const currentHours = useMemo(
    () => computeAllEmployeeHours(activeEmployees, periodDateKeys, currentPeriodShifts, shiftCodeById, 40, categoryById, focusAreaById),
    [activeEmployees, periodDateKeys, currentPeriodShifts, shiftCodeById, categoryById, focusAreaById],
  );

  const prevHours = useMemo(
    () => computeAllEmployeeHours(activeEmployees, prevPeriodDateKeys, prevPeriodShifts, shiftCodeById, 40, categoryById, focusAreaById),
    [activeEmployees, prevPeriodDateKeys, prevPeriodShifts, shiftCodeById, categoryById, focusAreaById],
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
        focusAreas, periodDates, currentPeriodShifts,
        activeEmployees, coverageRequirements, shiftCodes, shiftCodeById,
      ),
    [focusAreas, periodDates, currentPeriodShifts, activeEmployees, coverageRequirements, shiftCodes, shiftCodeById],
  );

  // Stat cards
  const periodStats = useMemo(() => {
    const currentCoverage = coverageFromSections(sectionCoverage);
    const prevPeriodDates = getDatesInRange(prevPeriodStart, periodDays);
    const prevCoverage = computeCoveragePctAndSlots(
      focusAreas, shiftCodes, coverageRequirements,
      prevPeriodDates, activeEmployees, prevPeriodShifts,
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
    sectionCoverage, currentPeriodShifts, prevPeriodShifts, shiftCodeById,
    focusAreas, shiftCodes, coverageRequirements, prevPeriodStart, periodDays,
    activeEmployees, otAlerts.length, prevOtCount,
  ]);

  // Open shifts
  const openShifts = useMemo(
    () =>
      computeOpenShifts(
        focusAreas, shiftCodes, coverageRequirements,
        periodDates, activeEmployees, currentPeriodShifts, shiftCodeById,
      ),
    [focusAreas, shiftCodes, coverageRequirements, periodDates, activeEmployees, currentPeriodShifts, shiftCodeById],
  );

  // Shift breakdown
  const shiftBreakdown = useMemo(
    () => computeShiftBreakdown(currentPeriodShifts, shiftCodeById, shiftCategories, focusAreas, activeEmployees),
    [currentPeriodShifts, shiftCodeById, shiftCategories, focusAreas, activeEmployees],
  );

  // Activity feed
  const activityItems = useMemo(
    () => buildActivityFeed(publishHistory, shiftRequests.requests, otAlerts),
    [publishHistory, shiftRequests.requests, otAlerts],
  );

  // ─── Permission checks ─────────────────────────────────
  const showOT = permissions.level >= 2 && permissions.canEditShifts;
  const showCoverage = permissions.canViewSchedule;
  const showOpenShifts = permissions.level >= 2;
  const showStaffHours = permissions.canViewStaff;
  const showBreakdown = permissions.canViewSchedule;
  const showActivity = true;

  // ─── Render ─────────────────────────────────────────────
  const headerProps = {
    periodStart,
    periodEnd,
    viewMode,
    orgName: org.name,
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
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-subtle)", fontSize: 13 }}>
            Loading dashboard data...
          </div>
        </div>
      </div>
    );
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
      <div style={contentStyle}>

      {/* OT Alert Banner */}
      {showOT && otAlerts.length > 0 && (
        <AlertBanner
          alerts={otAlerts}
          onReview={() => (window.location.href = "/schedule")}
        />
      )}

      {/* Stat Cards */}
      <StatCardsRow
        stats={periodStats}
        showOT={showOT}
        isMobile={isMobile}
        hasRequirements={coverageRequirements.length > 0}
        prevPeriodLabel={prevPeriodLabel}
        onExpand={() => setExpandedPanel("stats")}
      />

      {/* Coverage + Open Shifts */}
      {(showCoverage || showOpenShifts) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
            gap: 16,
          }}
        >
          {showCoverage && (
            <CoverageBySectionCard
              sections={sectionCoverage}
              focusAreaLabel={org.focusAreaLabel || "section"}
              isMobile={isMobile}
              hasRequirements={coverageRequirements.length > 0}
              onExpand={() => setExpandedPanel("coverage")}
            />
          )}
          {showOpenShifts && (
            <OpenShiftsCard
              openShifts={openShifts}
              onExpand={() => setExpandedPanel("openShifts")}
            />
          )}
        </div>
      )}

      {/* Bottom row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : isTablet
              ? "1fr 1fr"
              : "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {showStaffHours && (
          <StaffHoursCard
            employeeHours={currentHours}
            employees={activeEmployees}
            focusAreas={focusAreas}
            onExpand={() => setExpandedPanel("staffHours")}
          />
        )}
        {showBreakdown && (
          <ShiftBreakdownCard
            breakdown={shiftBreakdown}
            onExpand={() => setExpandedPanel("breakdown")}
          />
        )}
        {showActivity && (
          <ActivityFeed
            items={activityItems}
            onExpand={() => setExpandedPanel("activity")}
          />
        )}
      </div>

      {/* ─── Expanded Panels ──────────────────────────────── */}
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
          focusAreaById={focusAreaById}
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
        <ExpandedOpenShifts
          openShifts={openShifts}
          focusAreas={focusAreas}
          onClose={closeExpanded}
        />
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
          publishHistory={publishHistory}
          shiftRequests={shiftRequests.requests}
          otAlerts={otAlerts}
          onClose={closeExpanded}
        />
      )}
      </div>
    </div>
  );
}

const stickyBarStyle = {
  position: "sticky" as const,
  top: 56,
  zIndex: 99,
  background: "var(--color-bg)",
};

const toolbarContainerStyle = {
  padding: "12px 16px 0",
  borderBottom: "1px solid var(--color-border)",
  maxWidth: 1300,
  margin: "0 auto",
};

const contentStyle = {
  padding: "20px 16px 24px",
  maxWidth: 1300,
  margin: "0 auto",
  display: "flex" as const,
  flexDirection: "column" as const,
  gap: 20,
};
