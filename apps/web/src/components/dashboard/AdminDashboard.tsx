import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import ActionQueueCard, { buildActionItems } from "./ActionQueueCard";
import ActivityFeed from "./ActivityFeed";
import CoverageBySectionCard from "./CoverageBySectionCard";
import MyScheduleRow from "./MyScheduleRow";
import OpenShiftsCard from "./OpenShiftsCard";
import StaffHoursCard from "./StaffHoursCard";

export default function AdminDashboard(props: DashboardContentProps) {
  const {
    org,
    coverageRequirements,
    permissions,
    sectionCoverage,
    openShifts,
    publishedWindowState,
    publishHistory,
    activityItems,
    currentHours,
    activeEmployees,
    focusAreas,
    shiftRequests,
    currentEmpId,
    currentPeriodShifts,
    recentPublishedChanges,
    allShifts,
    assignmentById,
    assignmentNameMap,
    absenceTypeById,
    jobs,
    shiftCategories,
    periodDates,
    viewMode,
    draftNewCount,
    draftModifiedCount,
    draftDeletedCount,
    periodLabel,
    overtimeThreshold,
    isMobile,
    onExpandPanel,
  } = props;
  const draftTotal = draftNewCount + draftModifiedCount + draftDeletedCount;
  const actionItems = useMemo(
    () =>
      buildActionItems({
        isAdmin: true,
        pendingApproval: permissions.canApproveShiftRequests ? shiftRequests.pendingApproval : [],
        swapProposals: [],
        openPickups: [],
        openShifts,
        draftTotal,
        currentEmpId,
        onResolve: permissions.canApproveShiftRequests ? shiftRequests.resolve : undefined,
        assignmentNameMap,
      }),
    [
      currentEmpId,
      draftTotal,
      openShifts,
      permissions.canApproveShiftRequests,
      shiftRequests.pendingApproval,
      shiftRequests.resolve,
      assignmentNameMap,
    ],
  );
  const actionableCoverageSections = useMemo(
    () =>
      sectionCoverage
        .map((section, index) => ({ section, index }))
        .sort((a, b) => {
          const aOpenSlots = a.section.requiredTotal - a.section.filledTotal;
          const bOpenSlots = b.section.requiredTotal - b.section.filledTotal;
          if (aOpenSlots !== bOpenSlots) {
            return bOpenSlots - aOpenSlots;
          }
          if (a.section.pct !== b.section.pct) {
            return a.section.pct - b.section.pct;
          }
          return a.index - b.index;
        })
        .slice(0, 4)
        .map(({ section }) => section),
    [sectionCoverage],
  );
  const overtimeHours = useMemo(
    () => currentHours.filter((entry) => entry.isOvertime),
    [currentHours],
  );
  const isManagementOnly = Boolean(permissions.isManagementUser) && !permissions.isOnSchedule;

  return (
    <>
      <ActionQueueCard items={actionItems} maxVisible={5} grouped />

      <MyScheduleRow
        currentEmpId={currentEmpId}
        currentPeriodShifts={currentPeriodShifts}
        recentPublishedChanges={recentPublishedChanges}
        allShifts={allShifts}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        jobs={jobs}
        shiftCategories={shiftCategories}
        periodDates={periodDates}
        viewMode={viewMode}
        isMobile={isMobile}
        periodLabel={periodLabel}
        isManagementOnly={isManagementOnly}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "var(--dg-space-lg)",
        }}
      >
        {permissions.canViewSchedule && (
          <CoverageBySectionCard
            sections={actionableCoverageSections}
            focusAreaLabel={org.focusAreaLabel || "section"}
            isMobile={isMobile}
            hasRequirements={coverageRequirements.length > 0}
            canManageCoverageRequirements={permissions.canManageCoverageRequirements}
            publishedWindowState={publishedWindowState}
            publishHistory={publishHistory}
            orgTimeZone={org.timezone}
            periodLabel={periodLabel}
            onExpand={() => onExpandPanel("coverage")}
          />
        )}
        <OpenShiftsCard
          openShifts={openShifts}
          publishedWindowState={publishedWindowState}
          publishHistory={publishHistory}
          orgTimeZone={org.timezone}
          maxVisible={5}
          periodLabel={periodLabel}
          onExpand={() => onExpandPanel("openShifts")}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "var(--dg-space-lg)",
        }}
      >
        <ActivityFeed
          items={activityItems}
          maxVisible={5}
          onExpand={() => onExpandPanel("activity")}
        />
        <StaffHoursCard
          employeeHours={overtimeHours}
          employees={activeEmployees}
          focusAreas={focusAreas}
          canNavigateToDetailsPage={permissions.canManageEmployees}
          maxVisible={5}
          heading="Overtime watch"
          subtitle={`Staff over ${overtimeThreshold}h ${periodLabel}`}
          emptyMessage="No overtime alerts this period"
          otThreshold={overtimeThreshold}
          onExpand={() => onExpandPanel("staffHours")}
        />
      </div>
    </>
  );
}
