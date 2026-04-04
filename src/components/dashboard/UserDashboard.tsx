import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import QuickActionsBar from "./QuickActionsBar";
import MyScheduleCard from "./MyScheduleCard";
import ActionQueueCard, { buildActionItems } from "./ActionQueueCard";
import ShiftRequestsSummaryCard from "./ShiftRequestsSummaryCard";
import RecentChangesCard from "./RecentChangesCard";
import ActivityFeed from "./ActivityFeed";

export default function UserDashboard(props: DashboardContentProps) {
  const {
    permissions,
    shiftRequests,
    currentEmpId,
    currentEmployee,
    periodDates,
    currentPeriodShifts,
    shiftCodeById,
    absenceTypeById,
    publishHistory,
    activityItems,
    onExpandPanel,
  } = props;

  // Swap proposals directed at me
  const swapProposals = useMemo(
    () =>
      shiftRequests.myRequests.filter(
        (r) => r.type === "swap" && r.targetEmpId === String(currentEmpId) && r.status === "open",
      ),
    [shiftRequests.myRequests, currentEmpId],
  );

  const actionItems = useMemo(
    () =>
      buildActionItems({
        isAdmin: false,
        pendingApproval: [],
        swapProposals,
        openPickups: shiftRequests.openPickups,
        otAlerts: [],       // Users should not see OT alerts about others
        openShifts: [],
        draftTotal: 0,
        currentEmpId,
        onRespond: shiftRequests.respond,
        onClaim: shiftRequests.claim,
      }),
    [swapProposals, shiftRequests.openPickups, currentEmpId, shiftRequests.respond, shiftRequests.claim],
  );

  // Filter out OT alert items from activity feed — users shouldn't see other employees' overtime
  const userActivityItems = useMemo(
    () => activityItems.filter((item) => item.type !== "ot_alert"),
    [activityItems],
  );

  return (
    <>
      {/* Quick Actions */}
      <QuickActionsBar
        permissions={permissions}
        pendingApprovalCount={0}
        draftCount={0}
      />

      {/* My Schedule — most important for users */}
      <MyScheduleCard
        currentEmpId={currentEmpId}
        employee={currentEmployee}
        periodDates={periodDates}
        shifts={currentPeriodShifts}
        shiftCodeById={shiftCodeById}
        absenceTypeById={absenceTypeById}
      />

      {/* Action Queue — swap proposals, open pickups */}
      {actionItems.length > 0 && (
        <ActionQueueCard items={actionItems} />
      )}

      {/* Shift Requests — my requests + available pickups */}
      <ShiftRequestsSummaryCard
        isAdmin={false}
        openPickups={shiftRequests.openPickups}
        myRequests={shiftRequests.myRequests}
        pendingApproval={[]}
        currentEmpId={currentEmpId}
        onClaim={shiftRequests.claim}
        onRespond={shiftRequests.respond}
        onCancel={shiftRequests.cancel}
      />

      {/* Recent Changes — what changed since last visit */}
      <RecentChangesCard
        publishHistory={publishHistory}
        currentEmpId={currentEmpId}
        isAdmin={false}
      />

      {/* Activity Feed — filtered to exclude OT alerts */}
      <ActivityFeed
        items={userActivityItems}
        onExpand={() => onExpandPanel("activity")}
      />
    </>
  );
}
