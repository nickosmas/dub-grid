import { useMemo, useRef, useState, type ReactNode } from "react";
import { useHasSideColumn } from "../../../shared/navigation/useHasSideColumn";
import { FoldFade, useFoldEntering } from "../../../shared/layout/FoldFade";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { AnimatedListItem } from "../../../shared/motion/AnimatedListItem";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen, type ScreenScrollHandle } from "../../../shared/components/Screen";
import { useScrollToTopOnChange } from "../../../shared/hooks/useScrollToTopOnChange";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { queryClient } from "../../../shared/lib/query-client";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isManagementOnly } from "../../auth/hooks/employmentStatus";
import {
  addDaysToIsoDate,
  buildWeeklyHoursSummary,
  getFeaturedMeScheduleSegment,
  getIsoDateInTimeZone,
  getScheduleMonthStartDate,
  getScheduleRangeForDate,
} from "@dubgrid/schedule-core";
import {
  DuoHomeLayout,
  addMonthsToIso,
  useHomeMonth,
  useHomeSpan,
} from "../../schedule/components/DuoHomeLayout";
import { HomeMonthGrid } from "../../schedule/components/HomeMonthGrid";
import { formatCalendarMonthTitle } from "../../schedule/lib/schedule";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { mobileSpace, mobileSpacing } from "../../../shared/theme/tokens";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { useMyHomeSections } from "../hooks/useMyHomeSections";
import { usePrefetchAdjacentDashboardWeeks } from "../hooks/usePrefetchAdjacentDashboardWeeks";
import { WeekNavigatorHeader } from "../../schedule/components/WeekNavigatorHeader";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { DashboardHeroCard } from "../components/DashboardHeroCard";
import { HomeWash } from "../components/HomeWash";
import { ActionQueueCard } from "../components/ActionQueueCard";
import { MyHomeSections } from "../components/MyHomeSections";
import { SegmentedSwitch } from "../../../shared/components/SegmentedSwitch";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { SplitView, useSplitLayout } from "../../../shared/layout/SplitView";
import { SideColumnAlertsBar } from "../../schedule/components/SideColumnAlertsBar";
import { getWeekHeading } from "../../schedule/lib/week-range-label";
import { HomeSplitPane, useHomeSplit } from "../../schedule/components/HomeSplit";
import {
  formatScheduledHours,
  getCurrentTimeValue,
} from "../../schedule/lib/scheduleScreenHelpers";
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
  // Open on the iPhone Duo, My schedule sits beside the shift now or next
  // (or a picked shift or day), and Team beside the day's overview.
  const homeDefaultEntry = useMemo(() => {
    if (view !== "mine") return null;
    return (
      getFeaturedMeScheduleSegment({
        entries: mine.entries,
        rangeStartDate: range.startDate,
        selectedDate,
        todayDate,
        currentTime: getCurrentTimeValue(now, timeZone),
      }).item?.entry ?? null
    );
  }, [view, mine.entries, range.startDate, selectedDate, todayDate, now, timeZone]);
  const homeSplit = useHomeSplit({
    enabled: view === "mine",
    range,
    defaultEntry: homeDefaultEntry,
    defaultDate: selectedDate,
  });
  // Open on the iPhone Duo, My schedule is the week beside one day of it;
  // Team is its analytics across the whole width.
  const splitLayout = useSplitLayout();
  const inSplit = splitLayout !== null;
  // Week | Month, and the month the grid shows, for My schedule.
  const [span, setSpan] = useHomeSpan();
  const monthView = inSplit && view === "mine" && span === "month";
  const month = useHomeMonth(selectedDate);
  // On an iPhone Duo, open or closed, the bell stands in the side column.
  const sideColumn = useHasSideColumn();
  const foldEntering = useFoldEntering(splitLayout !== null);
  const scrollViewRef = useRef<ScreenScrollHandle | null>(null);
  useScrollToTopOnChange(scrollViewRef, `${view}:${range.startDate}`);
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
  // A week change keeps the previous week's cards on screen, undimmed, with a
  // small spinner beside the header's week until the new one lands, instead
  // of locking the stepper or dropping to a skeleton. Placeholder data is
  // exactly that state, the other week still on screen while this one loads;
  // a background refetch of the week already shown, from a pull or a realtime
  // nudge, is not.
  const isRefetching = dashboardQuery.isPlaceholderData || mine.isPlaceholderData;
  // The weeks either side are fetched shortly after this one, so the stepper
  // usually finds them in cache and moves without a spinner.
  usePrefetchAdjacentDashboardWeeks({
    accessToken,
    range,
    includeSchedule: !managementOnly,
    ready: bootstrapQuery.data !== undefined,
    currentLoaded: dashboardQuery.data !== undefined && !dashboardQuery.isPlaceholderData,
  });
  // The web build keeps the login page's aurora in the period's coverage
  // colour behind everything; on device the page is the plain grouped gray.
  const { height: windowHeight } = useWindowDimensions();
  const weeklyHours = useMemo(() => buildWeeklyHoursSummary(mine.entries, 40), [mine.entries]);
  const header = (
    <View style={styles.header}>
      <WeekNavigatorHeader
        controls={splitLayout === null}
        loading={isRefetching}
        hoursLabel={view === "mine" ? formatScheduledHours(weeklyHours) : null}
        range={range}
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
        scrollViewRef={scrollViewRef}
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
        scrollViewRef={scrollViewRef}
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
        scrollViewRef={scrollViewRef}
        refreshing={manualRefresh.isRefreshing}
        onRefresh={manualRefresh.refresh}
      >
        <EmptyStateCard
          body="Your numbers show here once the schedule is set up."
          fillScreen
          scene="dashboard-empty"
          title="No dashboard data yet"
        />
      </Screen>
    );
  }

  const data = dashboardQuery.data;
  // The server leaves approvals empty for an admin who can't approve, so the
  // card and the figure would only say "none waiting".
  const canApprove = Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests);
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
          showPendingApprovals={canApprove}
        />
      ),
    },
    ...(canApprove
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
            node: (
              <MyHomeSections
                data={mine}
                range={range}
                selectedDate={selectedDate}
                split={homeSplit.split ? homeSplit : undefined}
              />
            ),
          },
        ]
      : teamSections;

  // Home keeps its wash on every platform (owner, 2026-11-04).
  const wash = <HomeWash height={windowHeight} />;

  // Split, the wash runs once behind both panes.
  const page = (
    <Screen
      bottomPaddingMode="tabbed"
      scrollViewRef={scrollViewRef}
      pageBackground={inSplit ? undefined : wash}
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      stickyHeaderBackground={inSplit ? undefined : wash}
      stickyHeader={inSplit ? undefined : header}
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

  // On an iPhone Duo the bell, the arrows and Today stand in the side column;
  // in Month they scroll the grid a month up or down.
  const todayMonth = getScheduleMonthStartDate(todayDate);
  const alertsBar = (
    <SideColumnAlertsBar
      shown={sideColumn}
      stepper={
        monthView
          ? {
              previousLabel: "Previous month",
              nextLabel: "Next month",
              vertical: true,
              onPrevious: () => month.goToMonth(addMonthsToIso(month.visibleMonth, -1)),
              onNext: () => month.goToMonth(addMonthsToIso(month.visibleMonth, 1)),
              onToday: month.visibleMonth === todayMonth ? null : () => month.goToMonth(todayMonth),
            }
          : sideColumn
            ? {
                previousLabel: "Previous week",
                nextLabel: "Next week",
                onPrevious: () => setSelectedDateOverride(addDaysToIsoDate(selectedDate, -7)),
                onNext: () => setSelectedDateOverride(addDaysToIsoDate(selectedDate, 7)),
                onToday: getWeekHeading(range, todayDate, timeZone).isThisWeek
                  ? null
                  : () => setSelectedDateOverride(null),
              }
            : undefined
      }
      unreadCount={bootstrapQuery.data?.unreadNotificationCount ?? 0}
    />
  );
  if (!inSplit || !splitLayout) {
    return (
      <>
        {alertsBar}
        <FoldFade entering={foldEntering}>{page}</FoldFade>
      </>
    );
  }
  const heading = getWeekHeading(range, todayDate, timeZone);
  const duoTitle = monthView
    ? formatCalendarMonthTitle(month.visibleMonth, todayDate)
    : heading.title;
  const duoMeta = monthView
    ? formatScheduledHours(buildWeeklyHoursSummary(month.entries, 40))
    : [heading.dates, view === "mine" ? formatScheduledHours(weeklyHours) : null]
        .filter(Boolean)
        .join(" · ") || null;
  return (
    <>
      {alertsBar}
      <FoldFade entering={foldEntering}>
        <DuoHomeLayout
          background={wash}
          loading={isRefetching}
          meta={duoMeta}
          span={
            view === "mine"
              ? {
                  value: span,
                  onChange: (next) => {
                    if (next === "month") month.goToMonth(getScheduleMonthStartDate(selectedDate));
                    setSpan(next);
                  },
                }
              : undefined
          }
          tall={splitLayout.tall}
          title={duoTitle}
          view={
            hasOwnView
              ? { value: view, options: HOME_VIEW_OPTIONS, onChange: chooseView }
              : undefined
          }
        >
          {view === "team" ? (
            page
          ) : monthView ? (
            <View style={styles.month}>
              <HomeMonthGrid
                accessToken={accessToken}
                enabled={!managementOnly}
                scrollRequest={month.request}
                todayDate={todayDate}
                visibleMonth={month.visibleMonth}
                onEntriesChange={month.setEntries}
                onVisibleMonthChange={month.setVisibleMonth}
              />
            </View>
          ) : (
            <SplitView
              layout={splitLayout}
              list={page}
              detail={
                <HomeSplitPane
                  currentTime={getCurrentTimeValue(now, timeZone)}
                  entries={mine.entries}
                  home={homeSplit}
                  range={range}
                  teamEntries={mine.teamEntries}
                  todayDate={todayDate}
                />
              }
            />
          )}
        </DuoHomeLayout>
      </FoldFade>
    </>
  );
}

const styles = StyleSheet.create({
  // The page's own section rhythm: each card is a titled group.
  cards: {
    gap: mobileSpacing.sectionGap,
  },
  header: {
    gap: mobileSpace.md,
  },
  // Room for the month grid, which insets itself from the edges.
  month: {
    flex: 1,
  },
});
