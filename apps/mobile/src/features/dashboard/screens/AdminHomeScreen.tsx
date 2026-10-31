import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { AnimatedListItem } from "../../../shared/motion/AnimatedListItem";
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
  addDaysToIsoDate,
  getIsoDateInTimeZone,
  getScheduleRangeForDate,
} from "@dubgrid/schedule-core";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { mobileSpace, mobileSpacing } from "../../../shared/theme/tokens";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { useMyHomeSections } from "../hooks/useMyHomeSections";
import { usePrefetchAdjacentDashboardWeeks } from "../hooks/usePrefetchAdjacentDashboardWeeks";
import { WeekNavigatorHeader } from "../../schedule/components/WeekNavigatorHeader";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { DashboardHeroCard } from "../components/DashboardHeroCard";
import { CoverageWash } from "../components/CoverageWash";
import { PeriodLoadingOverlay } from "../components/PeriodLoadingOverlay";
import { ActionQueueCard } from "../components/ActionQueueCard";
import { MyHomeSections } from "../components/MyHomeSections";
import { SegmentedSwitch } from "../../../shared/components/SegmentedSwitch";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { StaffHoursCard } from "../components/StaffHoursCard";

type HomeView = "mine" | "team";

const HOME_VIEW_OPTIONS = [
  { value: "mine", label: "My schedule" },
  { value: "team", label: "Team" },
] as const satisfies ReadonlyArray<{ value: HomeView; label: string }>;

// Kept for as long as the app runs, so leaving Home and coming back lands on
// the view the admin last chose.
let lastHomeView: HomeView = "mine";

export function AdminHomeScreen() {
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  // The header's week stepper drives the whole page, as on the staff Home:
  // one week, one fetch, the same week on every card. Null is today.
  const now = useRealtimeNow();
  const timeZone = bootstrapQuery.data?.currentOrg?.timezone ?? null;
  const todayDate = getIsoDateInTimeZone(now, timeZone);
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null);
  const selectedDate = selectedDateOverride ?? todayDate;
  const range = useMemo(() => getScheduleRangeForDate(selectedDate), [selectedDate]);
  const dashboardQuery = useAdminDashboard(accessToken, range);
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const managementOnly = isManagementOnly(
    linkedEmployee?.focusAreaIds ?? [],
    linkedEmployee?.departmentIds ?? [],
  );
  // The admin's own day, for the same week as the rest of the page. Skipped
  // for management-only admins, who have no schedule of their own.
  const mine = useMyHomeSections({ accessToken, range, enabled: !managementOnly });
  const refetchMine = mine.refetch;
  // Someone who works shifts switches between their own week and the team's;
  // a management-only admin, or one with no staff profile, has only the team.
  const hasOwnView = !managementOnly && (mine.isOn || bootstrapQuery.isLoading);
  const [chosenView, setChosenView] = useState<HomeView>(lastHomeView);
  const view: HomeView = hasOwnView ? chosenView : "team";
  const chooseView = (next: HomeView) => {
    lastHomeView = next;
    setChosenView(next);
  };
  const manualRefresh = useManualRefresh(() =>
    Promise.all([
      dashboardQuery.refetch(),
      bootstrapQuery.refetch(),
      refetchMine(),
      queryClient.invalidateQueries({ queryKey: ["mobile", "dashboard"] }),
    ]),
  );

  const contentState = useMobileContentState({
    // Every part of the first paint, so the page shows one skeleton once
    // rather than clearing it and then filling the You group in underneath.
    hasData:
      dashboardQuery.data !== undefined && bootstrapQuery.data !== undefined && mine.isResolved,
    isLoading: dashboardQuery.isLoading || bootstrapQuery.isLoading || mine.isLoading,
    error: dashboardQuery.error ?? bootstrapQuery.error,
  });
  // A week change keeps the previous week's cards on screen under a scrim
  // with one spinner in the middle, instead of locking the stepper or dropping
  // to a skeleton: the change is visible as a change, not a freeze. Placeholder
  // data is exactly that state, the other week still on screen while this one
  // loads; a background refetch of the week already shown, from a pull or a
  // realtime nudge, is not.
  const isRefetching = dashboardQuery.isPlaceholderData || mine.isPlaceholderData;
  // The weeks either side are fetched alongside this one, so the stepper
  // finds them in cache and moves without the scrim.
  usePrefetchAdjacentDashboardWeeks({
    accessToken,
    range,
    includeSchedule: !managementOnly,
    ready: bootstrapQuery.data !== undefined,
    currentUpdatedAt: dashboardQuery.dataUpdatedAt,
  });
  // The login page's aurora in the period's coverage colour, the viewport's
  // height and fixed behind everything: status bar, sticky header and content.
  const { height: windowHeight } = useWindowDimensions();
  const header = (
    <View style={styles.header}>
      <WeekNavigatorHeader
        now={now}
        range={range}
        selectedDate={selectedDate}
        timeZone={timeZone}
        todayDate={todayDate}
        unreadCount={bootstrapQuery.data?.unreadNotificationCount ?? 0}
        onNextWeek={() => setSelectedDateOverride(addDaysToIsoDate(selectedDate, 7))}
        onPreviousWeek={() => setSelectedDateOverride(addDaysToIsoDate(selectedDate, -7))}
        onToday={() => setSelectedDateOverride(null)}
      />
      {hasOwnView ? (
        <SegmentedSwitch
          accessibilityLabel="Home view"
          options={HOME_VIEW_OPTIONS}
          value={view}
          onChange={chooseView}
        />
      ) : null}
    </View>
  );

  if (contentState.kind === "loading") {
    return (
      <Screen
        bottomPaddingMode="tabbed"
        // A skeleton stands in for content; it must not scroll.
        scrollEnabled={false}
        stickyHeader={header}
      >
        {contentState.showSkeleton ? <DashboardSkeleton view={view} /> : null}
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
          title="Couldn't load dashboard"
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
  const openExpanded = (pathname: `/(tabs)/home/${string}`) => () =>
    router.push({ pathname, params: { weekOf: range.startDate } });

  // Keyed so the stagger indexes the cards actually shown; a card that is
  // absent for this role does not leave a gap in the sequence. As on web, an
  // empty card stays and says so rather than dropping out of the page.
  const teamSections: Array<{ key: string; node: ReactNode }> = [
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
    {
      key: "approvals",
      node: (
        <ActionQueueCard
          requests={data.actionQueue}
          onSeeAll={openExpanded("/(tabs)/home/pending-approvals")}
        />
      ),
    },
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
    {
      key: "activity",
      node: (
        <ActivityFeedCard items={data.activity} onSeeAll={openExpanded("/(tabs)/home/activity")} />
      ),
    },
  ];
  const sections: Array<{ key: string; node: ReactNode }> =
    view === "mine"
      ? [
          {
            key: "mine",
            node: <MyHomeSections data={mine} range={range} selectedDate={selectedDate} />,
          },
        ]
      : teamSections;

  return (
    <Screen
      bottomPaddingMode="tabbed"
      pageBackground={<CoverageWash height={windowHeight} pct={data.metrics.coveragePct} />}
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      stickyHeaderBackground={<CoverageWash height={windowHeight} pct={data.metrics.coveragePct} />}
      stickyHeader={header}
      renderOverlay={isRefetching ? () => <PeriodLoadingOverlay /> : undefined}
    >
      <View style={styles.cards}>
        {sections.map((section, index) => (
          <AnimatedListItem index={index} key={`${view}-${section.key}`}>
            {section.node}
          </AnimatedListItem>
        ))}
      </View>
      {mine.confirmationModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The page's own section rhythm: each card is a titled section again, and
  // the coloured halos want air between them.
  cards: {
    gap: mobileSpacing.sectionGap,
  },
  header: {
    gap: mobileSpace.md,
  },
});
