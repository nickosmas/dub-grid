import { useMemo } from "react";
import type { DashboardContentProps } from "./DashboardContentProps";
import QuickActionsBar from "./QuickActionsBar";
import MyScheduleCard from "./MyScheduleCard";
import ActionQueueCard, { buildActionItems } from "./ActionQueueCard";
import ShiftRequestsSummaryCard from "./ShiftRequestsSummaryCard";
import RecentChangesCard from "./RecentChangesCard";

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
        openShifts: [],
        draftTotal: 0,
        currentEmpId,
        onRespond: shiftRequests.respond,
        onClaim: shiftRequests.claim,
      }),
    [swapProposals, shiftRequests.openPickups, currentEmpId, shiftRequests.respond, shiftRequests.claim],
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

      {/* Combined Requests & Changes Card */}
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Requests & Updates</div>
            <div className="dg-card-subtitle">Your shift requests and recent changes</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--dg-space-md)" }}>
          {/* Shift Requests Section */}
          <div>
            <div style={{ fontSize: "var(--dg-fs-small)", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "var(--dg-space-sm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Shift Requests
            </div>
            <ShiftRequestsSummaryCard
              isAdmin={false}
              openPickups={shiftRequests.openPickups.slice(0, 2)} // Limit to 2
              myRequests={shiftRequests.myRequests.slice(0, 2)} // Limit to 2
              pendingApproval={[]}
              currentEmpId={currentEmpId}
              onClaim={shiftRequests.claim}
              onRespond={shiftRequests.respond}
              onCancel={shiftRequests.cancel}
            />
          </div>

          {/* Recent Changes Section */}
          <div>
            <div style={{ fontSize: "var(--dg-fs-small)", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "var(--dg-space-sm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Recent Changes
            </div>
            <RecentChangesCard
              publishHistory={publishHistory}
              currentEmpId={currentEmpId}
              isAdmin={false}
            />
          </div>
        </div>
      </div>
    </>
  );
}
