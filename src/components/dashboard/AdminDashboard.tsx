import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { DashboardContentProps } from "./DashboardContentProps";
import QuickActionsBar from "./QuickActionsBar";
import AlertBanner from "./AlertBanner";
import ActionQueueCard, { buildActionItems } from "./ActionQueueCard";
import DraftStatusCard from "./DraftStatusCard";
import ShiftRequestsSummaryCard from "./ShiftRequestsSummaryCard";
import MyScheduleCard from "./MyScheduleCard";
import StatCardsRow from "./StatCardsRow";
import CoverageBySectionCard from "./CoverageBySectionCard";
import OpenShiftsCard from "./OpenShiftsCard";
import StaffHoursCard from "./StaffHoursCard";
import ShiftBreakdownCard from "./ShiftBreakdownCard";
import ActivityFeed from "./ActivityFeed";

const AnalyticsCharts = dynamic(() => import("@/components/dashboard/AnalyticsCharts"), { ssr: false });

export default function AdminDashboard(props: DashboardContentProps) {
  const {
    org,
    focusAreas,
    shiftCodes,
    shiftCategories,
    coverageRequirements,
    shiftCodeById,
    employees,
    activeEmployees,
    permissions,
    periodDates,
    periodStart,
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
    prevPeriodLabel,
    onExpandPanel,
  } = props;

  const showOT = permissions.canEditShifts;
  const draftTotal = draftNewCount + draftModifiedCount + draftDeletedCount;

  const actionItems = useMemo(
    () =>
      buildActionItems({
        isAdmin: true,
        pendingApproval: shiftRequests.pendingApproval,
        swapProposals: [],
        openPickups: [],
        otAlerts: showOT ? otAlerts : [],
        openShifts,
        draftTotal,
        currentEmpId,
        onResolve: shiftRequests.resolve,
      }),
    [shiftRequests.pendingApproval, otAlerts, openShifts, draftTotal, currentEmpId, showOT, shiftRequests.resolve],
  );

  return (
    <>
      {/* Quick Actions */}
      <QuickActionsBar
        permissions={permissions}
        pendingApprovalCount={shiftRequests.pendingApproval.length}
        draftCount={draftTotal}
      />

      {/* OT Alert Banner */}
      {showOT && otAlerts.length > 0 && (
        <AlertBanner
          alerts={otAlerts}
          onReview={() => (window.location.href = "/schedule")}
        />
      )}

      {/* Action Queue */}
      {actionItems.length > 0 && (
        <ActionQueueCard items={actionItems} />
      )}

      {/* Draft Status + Approval Queue (2 columns) */}
      {(draftTotal > 0 || shiftRequests.pendingApproval.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 16,
          }}
        >
          <DraftStatusCard
            newCount={draftNewCount}
            modifiedCount={draftModifiedCount}
            deletedCount={draftDeletedCount}
          />
          {permissions.canApproveShiftRequests && (
            <ShiftRequestsSummaryCard
              isAdmin
              openPickups={shiftRequests.openPickups}
              myRequests={shiftRequests.myRequests}
              pendingApproval={shiftRequests.pendingApproval}
              currentEmpId={currentEmpId}
              onResolve={shiftRequests.resolve}
            />
          )}
        </div>
      )}

      {/* Stat Cards */}
      <StatCardsRow
        stats={periodStats}
        showOT={showOT}
        isMobile={isMobile}
        hasRequirements={coverageRequirements.length > 0}
        prevPeriodLabel={prevPeriodLabel}
        onExpand={() => onExpandPanel("stats")}
      />

      {/* Coverage + Open Shifts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
          gap: 16,
        }}
      >
        {permissions.canViewSchedule && (
          <CoverageBySectionCard
            sections={sectionCoverage}
            focusAreaLabel={org.focusAreaLabel || "section"}
            isMobile={isMobile}
            hasRequirements={coverageRequirements.length > 0}
            onExpand={() => onExpandPanel("coverage")}
          />
        )}
        <OpenShiftsCard
          openShifts={openShifts}
          onExpand={() => onExpandPanel("openShifts")}
        />
      </div>

      {/* Bottom row: Staff Hours + Breakdown + Activity */}
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
        {permissions.canViewStaff && (
          <StaffHoursCard
            employeeHours={currentHours}
            employees={activeEmployees}
            focusAreas={focusAreas}
            onExpand={() => onExpandPanel("staffHours")}
          />
        )}
        <ShiftBreakdownCard
          breakdown={shiftBreakdown}
          onExpand={() => onExpandPanel("breakdown")}
        />
        <ActivityFeed
          items={activityItems}
          onExpand={() => onExpandPanel("activity")}
        />
      </div>

      {/* My Schedule (lower priority for admins) */}
      <MyScheduleCard
        currentEmpId={currentEmpId}
        employee={currentEmployee}
        periodDates={periodDates}
        shifts={currentPeriodShifts}
        shiftCodeById={shiftCodeById}
        absenceTypeById={absenceTypeById}
      />

      {/* Analytics Charts */}
      {org.id && (
        <div style={{ marginTop: 8 }}>
          <h2 style={{ fontSize: "var(--dg-fs-title)", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 16 }}>
            Analytics
          </h2>
          <AnalyticsCharts orgId={org.id} />
        </div>
      )}
    </>
  );
}
