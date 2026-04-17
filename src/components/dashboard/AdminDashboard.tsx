import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import ActivityFeed from "./ActivityFeed";
import CoverageBySectionCard from "./CoverageBySectionCard";
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
    activityItems,
    currentHours,
    activeEmployees,
    focusAreas,
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
        {permissions.canViewSchedule && (
          <CoverageBySectionCard
            sections={sectionCoverage.slice(0, 4)}
            focusAreaLabel={org.focusAreaLabel || "section"}
            isMobile={isMobile}
            hasRequirements={coverageRequirements.length > 0}
            publishedWindowState={publishedWindowState}
            onExpand={() => onExpandPanel("coverage")}
          />
        )}
        <OpenShiftsCard
          openShifts={openShifts}
          publishedWindowState={publishedWindowState}
          maxVisible={5}
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
          subtitle="Staff trending over 40h this period"
          emptyMessage="No overtime alerts this period"
          onExpand={() => onExpandPanel("staffHours")}
        />
      </div>
    </>
  );
}
