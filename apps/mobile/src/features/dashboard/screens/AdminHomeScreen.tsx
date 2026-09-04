import { useMemo, useState } from "react";
import { router } from "expo-router";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { queryClient } from "../../../shared/lib/query-client";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isManagementOnly } from "../../auth/hooks/employmentStatus";
import {
  formatDashboardDateRange,
  getDashboardPeriodRange,
  type DashboardPeriodMode,
} from "../../../shared/lib/dates";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { useMyScheduleQuery } from "../hooks/useMyScheduleQuery";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardHeaderSkeleton, DashboardSkeleton } from "../components/DashboardSkeleton";
import { DashboardHeroCard } from "../components/DashboardHeroCard";
import { PeriodToggle } from "../components/PeriodToggle";
import { ActionQueueCard } from "../components/ActionQueueCard";
import { MyScheduleCard } from "../components/MyScheduleCard";
import { CoverageBySectionCard } from "../components/CoverageBySectionCard";
import { OpenShiftsCard } from "../components/OpenShiftsCard";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { StaffHoursCard } from "../components/StaffHoursCard";

export function AdminHomeScreen() {
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  // One global toggle (at the top of the screen) drives the whole dashboard —
  // a single fetch, one consistent period across every card.
  const [periodMode, setPeriodMode] = useState<DashboardPeriodMode>("week");
  const payPeriodStartDate = bootstrapQuery.data?.currentOrg?.payPeriodStartDate ?? null;
  const range = useMemo(
    () => getDashboardPeriodRange(periodMode, new Date(), payPeriodStartDate),
    [periodMode, payPeriodStartDate],
  );
  const dashboardQuery = useAdminDashboard(accessToken, range);
  const role = bootstrapQuery.data?.effectiveRole;
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const managementOnly = isManagementOnly(
    linkedEmployee?.focusAreaIds ?? [],
    linkedEmployee?.departmentIds ?? [],
  );
  // Shares its key with MyScheduleCard's own call, so this is one fetch, not
  // two. Read here purely so the card's data gates the page's single skeleton
  // instead of the card popping in after it. Skipped entirely for
  // management-only users, who never see the card.
  const myScheduleQuery = useMyScheduleQuery(accessToken, { enabled: !managementOnly });
  // Pull-to-refresh still reaches the card through the shared ["mobile",
  // "dashboard"] key prefix — the same mechanism realtime invalidation uses.
  const manualRefresh = useManualRefresh(() =>
    Promise.all([
      dashboardQuery.refetch(),
      bootstrapQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["mobile", "dashboard"] }),
    ]),
  );

  // "Resolved", not "succeeded": a failed schedule card should not take the
  // whole dashboard to an error screen, it just renders empty. But it does
  // have to finish before the skeleton comes down, or it lands afterwards and
  // shifts every card below it.
  const myScheduleResolved =
    managementOnly || myScheduleQuery.data !== undefined || Boolean(myScheduleQuery.error);
  const contentState = useMobileContentState({
    // Both halves of the first paint, so the page shows one skeleton once
    // rather than clearing it and then filling a card in underneath.
    hasData:
      dashboardQuery.data !== undefined && bootstrapQuery.data !== undefined && myScheduleResolved,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading || myScheduleQuery.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });

  if (contentState.kind === "loading") {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        // A skeleton stands in for content; it must not scroll.
        scrollEnabled={false}
        stickyHeader={contentState.showSkeleton ? <DashboardHeaderSkeleton /> : undefined}
      >
        {contentState.showSkeleton ? (
          <DashboardSkeleton
            // Both default to shown: until bootstrap resolves the most common
            // shape is the admin one, and guessing wrong costs one card of
            // silhouette rather than a layout jump.
            showActionQueue={role === undefined || role === "admin"}
            showMySchedule={!managementOnly}
          />
        ) : null}
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen
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

  // `contentState` covers loading and error, so this is the "resolved but
  // empty" case. Rendering null here left a genuinely blank screen with no way
  // to retry.
  if (!dashboardQuery.data) {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        refreshing={manualRefresh.isRefreshing}
        onRefresh={manualRefresh.refresh}
      >
        <EmptyStateCard
          actionLabel="Refresh"
          body="There's nothing to show for this organization yet. Pull to refresh once your schedule is set up."
          fillScreen
          iconName="stats-chart-outline"
          onAction={() => {
            void dashboardQuery.refetch();
          }}
          title="No dashboard data yet"
        />
      </Screen>
    );
  }

  const data = dashboardQuery.data;
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
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      stickyHeader={
        <DashboardHeader
          firstName={firstName}
          orgName={bootstrapQuery.data?.currentOrg.name ?? ""}
          timezone={bootstrapQuery.data?.currentOrg.timezone ?? null}
          periodLabel={formatDashboardDateRange(
            data.range.startDate,
            data.range.endDate,
            periodMode,
          )}
        />
      }
    >
      <PeriodToggle
        mode={periodMode}
        onChange={setPeriodMode}
        loading={dashboardQuery.isFetching}
      />
      <DashboardHeroCard summary={data.heroSummary} metrics={data.metrics} />
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
