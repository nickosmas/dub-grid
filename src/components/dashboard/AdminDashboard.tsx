import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import DashboardStatusBar from "./DashboardStatusBar";
import ActionQueueCard, { buildActionItems } from "./ActionQueueCard";
import CoverageBySectionCard from "./CoverageBySectionCard";
import OpenShiftsCard from "./OpenShiftsCard";
import ActivityFeed from "./ActivityFeed";

export default function AdminDashboard(props: DashboardContentProps) {
  const {
    org,
    coverageRequirements,
    permissions,
    sectionCoverage,
    openShifts,
    otAlerts,
    periodStats,
    activityItems,
    shiftRequests,
    currentEmpId,
    draftNewCount,
    draftModifiedCount,
    draftDeletedCount,
    isMobile,
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
      {/* Zone 1: Status Bar */}
      <DashboardStatusBar
        coveragePct={periodStats.coverage?.pct ?? 100}
        otAlertCount={showOT ? otAlerts.length : 0}
        pendingApprovalCount={shiftRequests.pendingApproval.length}
        draftCount={draftTotal}
        urgentGapCount={openShifts.filter((s) => s.urgency === "high").length}
        hasRequirements={coverageRequirements.length > 0}
        permissions={permissions}
        onExpandStats={() => onExpandPanel("stats")}
      />

      {/* Zone 2: Action Queue (hero) */}
      <ActionQueueCard items={actionItems} variant="hero" grouped />

      {/* Zone 3: Context Cards */}
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

      {/* Activity Feed (collapsible) */}
      <ActivityFeed
        items={activityItems}
        defaultCollapsed
        onExpand={() => onExpandPanel("activity")}
      />
    </>
  );
}
