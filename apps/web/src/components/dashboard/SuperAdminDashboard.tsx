import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import StaffHoursCard from "./StaffHoursCard";
import CoverageBySectionCard from "./CoverageBySectionCard";
import OpenShiftsCard from "./OpenShiftsCard";
import ActivityFeed from "./ActivityFeed";

export default function SuperAdminDashboard(props: DashboardContentProps) {
  const {
    org,
    coverageRequirements,
    sectionCoverage,
    openShifts,
    publishedWindowState,
    activityItems,
    currentHours,
    activeEmployees,
    focusAreas,
    periodLabel,
    overtimeThreshold,
    isMobile,
    onExpandPanel,
  } = props;
  const overtimeHours = useMemo(
    () => currentHours.filter((entry) => entry.isOvertime),
    [currentHours],
  );

  return (
    <>
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
          publishedWindowState={publishedWindowState}
          periodLabel={periodLabel}
          onExpand={() => onExpandPanel("coverage")}
        />
        <OpenShiftsCard
          openShifts={openShifts}
          publishedWindowState={publishedWindowState}
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
