import { useMemo, useState } from "react";
import { Screen } from "../../../shared/components/Screen";
import { LoadingScreen } from "../../../shared/components/LoadingScreen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isManagementOnly } from "../../auth/hooks/employmentStatus";
import { getDashboardPeriodRange, type DashboardPeriodMode } from "../../../shared/lib/dates";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardHeroCard } from "../components/DashboardHeroCard";
import { ActionQueueCard } from "../components/ActionQueueCard";
import { MyScheduleCard } from "../components/MyScheduleCard";
import { CoverageBySectionCard } from "../components/CoverageBySectionCard";
import { OpenShiftsCard } from "../components/OpenShiftsCard";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { StaffHoursCard } from "../components/StaffHoursCard";

export function AdminHomeScreen() {
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  // Shared across the coverage-gaps, open-shifts, and overtime-watch cards —
  // one fetch, one consistent period, rather than each card independently
  // choosing its own range.
  const [periodMode, setPeriodMode] = useState<DashboardPeriodMode>("week");
  const range = useMemo(() => getDashboardPeriodRange(periodMode), [periodMode]);
  const dashboardQuery = useAdminDashboard(accessToken, range);

  if (bootstrapQuery.isLoading || dashboardQuery.isLoading) {
    return (
      <LoadingScreen
        title="Loading your dashboard"
        body="Getting the latest for your organization."
      />
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen title="Home" bottomPaddingMode="tabbed">
        <QueryStateCard
          title="Couldn't load your dashboard"
          body="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const data = dashboardQuery.data;
  const role = bootstrapQuery.data?.effectiveRole;
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const managementOnly = isManagementOnly(
    linkedEmployee?.focusAreaIds ?? [],
    linkedEmployee?.departmentIds ?? [],
  );
  // Prefer the linked employee record's name — it's always populated from the
  // employees table. auth user_metadata.first_name (user.firstName) is often
  // empty for invited accounts, and email is the last resort, mirroring web's
  // DashboardView.tsx: currentEmployee?.firstName || authUser?.email...
  const firstName =
    linkedEmployee?.firstName?.trim() ||
    bootstrapQuery.data?.user.firstName?.trim() ||
    bootstrapQuery.data?.user.email?.split("@")[0] ||
    null;

  return (
    <Screen
      title="Home"
      subtitle="Organization overview"
      bottomPaddingMode="tabbed"
      stickyHeader={
        <DashboardHeader
          firstName={firstName}
          orgName={bootstrapQuery.data?.currentOrg.name ?? ""}
          timezone={bootstrapQuery.data?.currentOrg.timezone ?? null}
        />
      }
    >
      <DashboardHeroCard summary={data.heroSummary} metrics={data.metrics} />
      {role === "admin" ? <ActionQueueCard requests={data.actionQueue} /> : null}
      {!managementOnly ? <MyScheduleCard accessToken={accessToken} /> : null}
      <CoverageBySectionCard
        sections={data.coverageBySection}
        periodMode={periodMode}
        onPeriodModeChange={setPeriodMode}
      />
      <OpenShiftsCard
        openShifts={data.openShifts}
        periodMode={periodMode}
        onPeriodModeChange={setPeriodMode}
      />
      <ActivityFeedCard items={data.activity} />
      <StaffHoursCard
        entries={data.staffHours}
        thresholdHours={data.overtimeThresholdHours}
        periodMode={periodMode}
        onPeriodModeChange={setPeriodMode}
      />
    </Screen>
  );
}
