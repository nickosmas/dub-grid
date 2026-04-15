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
        <CoverageBySectionCard
          sections={sectionCoverage}
          focusAreaLabel={org.focusAreaLabel || "section"}
          isMobile={isMobile}
          hasRequirements={coverageRequirements.length > 0}
          onExpand={() => onExpandPanel("coverage")}
        />
        <OpenShiftsCard
          openShifts={openShifts}
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
