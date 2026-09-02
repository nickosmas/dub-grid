import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import StaffHoursCard from "./StaffHoursCard";
import CoverageBySectionCard from "./CoverageBySectionCard";
import MyScheduleRow from "./MyScheduleRow";
import OpenShiftsCard from "./OpenShiftsCard";
import ActivityFeed from "./ActivityFeed";

export default function SuperAdminDashboard(props: DashboardContentProps) {
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
    currentEmpId,
    currentPeriodShifts,
    allShifts,
    assignmentById,
    absenceTypeById,
    jobs,
    shiftCategories,
    periodDates,
    viewMode,
    periodLabel,
    overtimeThreshold,
    isMobile,
    onExpandPanel,
  } = props;
  const overtimeHours = useMemo(
    () => currentHours.filter((entry) => entry.isOvertime),
    [currentHours],
  );
  const isManagementOnly = Boolean(permissions.isManagementUser) && !permissions.isOnSchedule;

  return (
    <>
      <MyScheduleRow
        currentEmpId={currentEmpId}
        currentPeriodShifts={currentPeriodShifts}
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
        <CoverageBySectionCard
          sections={sectionCoverage}
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
        <OpenShiftsCard
          openShifts={openShifts}
          publishedWindowState={publishedWindowState}
          publishHistory={publishHistory}
          orgTimeZone={org.timezone}
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
