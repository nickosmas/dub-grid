import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Screen } from "../../../shared/components/Screen";
import { HeroSkeleton, ListSkeleton } from "../../../shared/components/Skeleton";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { queryClient } from "../../../shared/lib/query-client";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isManagementOnly } from "../../auth/hooks/employmentStatus";
import {
  formatDashboardDateRange,
  getDashboardPeriodRange,
  type DashboardPeriodMode,
} from "../../../shared/lib/dates";
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
  // One global toggle (in the hero card) drives the whole dashboard — a
  // single fetch, one consistent period across every card.
  const [periodMode, setPeriodMode] = useState<DashboardPeriodMode>("week");
  const payPeriodStartDate = bootstrapQuery.data?.currentOrg?.payPeriodStartDate ?? null;
  const range = useMemo(
    () => getDashboardPeriodRange(periodMode, new Date(), payPeriodStartDate),
    [periodMode, payPeriodStartDate],
  );
  const dashboardQuery = useAdminDashboard(accessToken, range);
  // MyScheduleCard owns its own query (["mobile", "dashboard", "my-schedule",
  // accessToken]) rather than being lifted here, so a manual pull-to-refresh
  // reaches it via the shared ["mobile", "dashboard"] key prefix — the same
  // mechanism the realtime invalidation path uses.
  const manualRefresh = useManualRefresh(() =>
    Promise.all([
      dashboardQuery.refetch(),
      bootstrapQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["mobile", "dashboard"] }),
    ]),
  );

  const contentState = getMobileQueryContentState({
    hasData: dashboardQuery.data !== undefined,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen title="Home" subtitle="Organization overview" bottomPaddingMode="tabbed">
        <HeroSkeleton />
        <ListSkeleton rows={2} />
        <ListSkeleton rows={3} />
        <ListSkeleton rows={2} showSectionHeader={false} />
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen
        title="Home"
        bottomPaddingMode="tabbed"
        refreshing={manualRefresh.isRefreshing}
        onRefresh={manualRefresh.refresh}
      >
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load dashboard"
          variant="centered"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!dashboardQuery.data) {
    return null;
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
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      stickyHeader={
        <DashboardHeader
          firstName={firstName}
          orgName={bootstrapQuery.data?.currentOrg.name ?? ""}
          timezone={bootstrapQuery.data?.currentOrg.timezone ?? null}
          periodLabel={formatDashboardDateRange(data.range.startDate, data.range.endDate, periodMode)}
        />
      }
    >
      <DashboardHeroCard
        summary={data.heroSummary}
        metrics={data.metrics}
        periodMode={periodMode}
        onPeriodModeChange={setPeriodMode}
        isFetching={dashboardQuery.isFetching}
      />
      {role === "admin" ? (
        <ActionQueueCard
          requests={data.actionQueue}
          onSeeAll={() =>
            router.push({ pathname: "/(tabs)/home/pending-approvals", params: { periodMode } })
          }
        />
      ) : null}
      {!managementOnly ? (
        <MyScheduleCard
          accessToken={accessToken}
          onExpand={() => router.push("/(tabs)/home/my-schedule")}
        />
      ) : null}
      <CoverageBySectionCard
        sections={data.coverageBySection}
        focusAreaLabel={bootstrapQuery.data?.currentOrg.labels?.focusArea ?? "Wings"}
        onSeeAll={() => router.push({ pathname: "/(tabs)/home/coverage", params: { periodMode } })}
      />
      <OpenShiftsCard
        openShifts={data.openShifts}
        onSeeAll={() =>
          router.push({ pathname: "/(tabs)/home/open-shifts", params: { periodMode } })
        }
      />
      <StaffHoursCard
        entries={data.staffHours}
        thresholdHours={data.overtimeThresholdHours}
        onSeeAll={() =>
          router.push({ pathname: "/(tabs)/home/staff-hours", params: { periodMode } })
        }
      />
      <ActivityFeedCard
        items={data.activity}
        onSeeAll={() => router.push({ pathname: "/(tabs)/home/activity", params: { periodMode } })}
      />
    </Screen>
  );
}
