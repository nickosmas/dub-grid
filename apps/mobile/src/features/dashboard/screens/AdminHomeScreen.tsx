import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AnimatedListItem } from "../../../shared/motion/AnimatedListItem";
import { useMotionPreference } from "../../../shared/motion/useMotionPreference";
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
import { mobileMotion, mobileSpacing } from "../../../shared/theme/tokens";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { useMyScheduleQuery } from "../hooks/useMyScheduleQuery";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardHeaderSkeleton, DashboardSkeleton } from "../components/DashboardSkeleton";
import { DashboardHeadline, DashboardHeroCard } from "../components/DashboardHeroCard";
import { CoverageWash } from "../components/CoverageWash";
import { DraftSummaryCard } from "../components/DraftSummaryCard";
import { PeriodToggle } from "../components/PeriodToggle";
import { ActionQueueCard } from "../components/ActionQueueCard";
import { MyScheduleCard } from "../components/MyScheduleCard";
import { OpenShiftsCard } from "../components/OpenShiftsCard";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { StaffHoursCard } from "../components/StaffHoursCard";

/** Opacity of the card column while a period change is still fetching. */
const REFETCH_DIM = 0.6;

export function AdminHomeScreen() {
  const { accessToken } = useSessionState();
  const { timing } = useMotionPreference();
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
  // A period change keeps the previous period's cards on screen and dims
  // them until the next one lands, instead of locking the toggle: the page
  // stays readable and the change is visible as a change, not a freeze.
  const isRefetching = dashboardQuery.isFetching && !dashboardQuery.isLoading;
  const contentOpacity = useSharedValue(1);
  useEffect(() => {
    contentOpacity.value = withTiming(
      isRefetching ? REFETCH_DIM : 1,
      timing("standard", mobileMotion.duration.base),
    );
  }, [contentOpacity, isRefetching, timing]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  // The login page's aurora in the period's coverage colour, the viewport's
  // height and fixed behind everything: status bar, sticky header and content.
  const { height: windowHeight } = useWindowDimensions();

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
  const draftSummary = data.metrics.draftSummary;
  const hasPersonalSchedule =
    Boolean(myScheduleQuery.error) || (myScheduleQuery.data?.entries.length ?? 0) > 0;
  // Prefer the linked employee record's name — it's always populated from the
  // employees table. auth user_metadata.first_name (user.firstName) is often
  // empty for invited accounts, and email is the last resort, mirroring web's
  // DashboardView.tsx: currentEmployee?.firstName || authUser?.email...
  const firstName =
    linkedEmployee?.firstName?.trim() ||
    bootstrapQuery.data?.user.firstName?.trim() ||
    bootstrapQuery.data?.user.email?.split("@")[0] ||
    null;
  const openExpanded = (pathname: `/(tabs)/home/${string}`) => () =>
    router.push({ pathname, params: { periodMode } });

  // Keyed so the stagger indexes the cards actually shown; a card that is
  // absent for this role or period does not leave a gap in the sequence.
  const sections: Array<{ key: string; node: ReactNode }> = [
    {
      key: "coverage-summary",
      node: (
        <DashboardHeroCard
          metrics={data.metrics}
          sections={data.coverageBySection}
          onOpenApprovals={openExpanded("/(tabs)/home/pending-approvals")}
          onOpenCoverage={
            data.coverageBySection.length > 0 ? openExpanded("/(tabs)/home/coverage") : undefined
          }
          onOpenGaps={openExpanded("/(tabs)/home/open-shifts")}
        />
      ),
    },
    ...(draftSummary && draftSummary.total > 0
      ? [
          {
            key: "drafts",
            node: <DraftSummaryCard summary={draftSummary} />,
          },
        ]
      : []),
    ...(role === "admin" && data.actionQueue.length > 0
      ? [
          {
            key: "approvals",
            node: (
              <ActionQueueCard
                requests={data.actionQueue}
                onSeeAll={openExpanded("/(tabs)/home/pending-approvals")}
              />
            ),
          },
        ]
      : []),
    ...(!managementOnly && hasPersonalSchedule
      ? [
          {
            key: "my-schedule",
            node: (
              <MyScheduleCard
                accessToken={accessToken}
                onExpand={() => router.push("/(tabs)/home/my-schedule")}
              />
            ),
          },
        ]
      : []),
    ...(data.openShifts.length > 0
      ? [
          {
            key: "open-shifts",
            node: (
              <OpenShiftsCard
                openShifts={data.openShifts}
                onSeeAll={openExpanded("/(tabs)/home/open-shifts")}
              />
            ),
          },
        ]
      : []),
    ...(data.staffHours.length > 0
      ? [
          {
            key: "staff-hours",
            node: (
              <StaffHoursCard
                entries={data.staffHours}
                thresholdHours={data.overtimeThresholdHours}
                onSeeAll={openExpanded("/(tabs)/home/staff-hours")}
              />
            ),
          },
        ]
      : []),
    ...(data.activity.length > 0
      ? [
          {
            key: "activity",
            node: (
              <ActivityFeedCard
                items={data.activity}
                onSeeAll={openExpanded("/(tabs)/home/activity")}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <Screen
      bottomPaddingMode="tabbed"
      pageBackground={<CoverageWash height={windowHeight} pct={data.metrics.coveragePct} />}
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      stickyHeaderBackground={<CoverageWash height={windowHeight} pct={data.metrics.coveragePct} />}
      stickyHeader={
        <DashboardHeader
          firstName={firstName}
          periodLabel={formatDashboardDateRange(
            data.range.startDate,
            data.range.endDate,
            periodMode,
          )}
        />
      }
    >
      <PeriodToggle mode={periodMode} onChange={setPeriodMode} />
      <DashboardHeadline summary={data.heroSummary} />
      <Animated.View style={[styles.cards, dimStyle]}>
        {sections.map((section, index) => (
          <AnimatedListItem index={index} key={section.key}>
            {section.node}
          </AnimatedListItem>
        ))}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The page's own section rhythm: each card is a titled section again, and
  // the coloured halos want air between them.
  cards: {
    gap: mobileSpacing.sectionGap,
  },
});
