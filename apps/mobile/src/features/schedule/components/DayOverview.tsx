import type { MobileScheduleEntry, MobileScheduleRange } from "@dubgrid/contracts";
import { formatScheduleDayLabel } from "@dubgrid/schedule-core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Screen } from "../../../shared/components/Screen";
import { getDashboard, getOrgSchedule, getShiftRequests } from "../../../shared/lib/api";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE_COMPACT,
  mobileRadii,
  mobileSpace,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isAdminHomeRole } from "../../auth/hooks/useTabsGate";
import { coverageColor } from "../../dashboard/lib/coverage";
import { getAdminDashboardQueryKey } from "../../dashboard/hooks/useAdminDashboard";
import {
  buildDayCoverage,
  buildDayOpenShifts,
  buildDayRequests,
  findViewerDay,
} from "../lib/day-overview";
import { buildDayRoster } from "../../shift-requests/lib/day-roster";

const NO_ENTRIES: readonly MobileScheduleEntry[] = [];

/**
 * One day at a glance, the Schedule split view's right pane on an open
 * iPhone Duo. Admins see each area's coverage (Home's own numbers), everyone
 * the day's open shifts and requests; staff see their own day first and no
 * coverage numbers.
 */
export function DayOverview({
  date,
  range,
  entries: entriesProp,
  now,
  showDate = false,
  showViewerDay,
  showRoster = false,
}: {
  date: string;
  range: MobileScheduleRange;
  /** The team's schedule for the week, when the page already has it; otherwise loaded here. */
  entries?: readonly MobileScheduleEntry[];
  now: Date;
  /** The day as a title, where the list beside it doesn't already show it. */
  showDate?: boolean;
  /** The viewer's own day first; staff only unless set. */
  showViewerDay?: boolean;
  /** Each shift that day with who works it, as Home's Team view lists it. */
  showRoster?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const bootstrap = useBootstrap(accessToken).data;
  const timeZone = bootstrap?.currentOrg.timezone;
  const viewerEmpId = bootstrap?.linkedEmployee?.id ?? null;
  const permissions = bootstrap?.permissions;
  const canSeeAllRequests = Boolean(
    permissions?.canApproveShiftRequests ||
    permissions?.canEditShifts ||
    permissions?.canManageEmployees,
  );
  const showsCoverage = isAdminHomeRole(bootstrap?.effectiveRole);

  const requestsQuery = useQuery({
    queryKey: mobileQueryKeys.shiftRequests(accessToken, range),
    queryFn: ({ signal }) => getShiftRequests(accessToken!, range, signal),
    enabled: Boolean(accessToken && bootstrap),
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  const canViewSchedule = Boolean(permissions?.canViewSchedule);
  const teamQuery = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "team", range),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, range, signal),
    enabled: Boolean(accessToken) && canViewSchedule && entriesProp === undefined,
  });
  const entries = entriesProp ?? teamQuery.data?.entries ?? NO_ENTRIES;
  const dashboardQuery = useQuery({
    queryKey: getAdminDashboardQueryKey(accessToken, range),
    queryFn: ({ signal }) => getDashboard(accessToken!, range, signal),
    enabled: Boolean(accessToken) && showsCoverage,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });

  const coverage = useMemo(
    () =>
      showsCoverage && dashboardQuery.data && !dashboardQuery.isPlaceholderData
        ? buildDayCoverage(dashboardQuery.data.coverageBySection, date)
        : [],
    [showsCoverage, dashboardQuery.data, dashboardQuery.isPlaceholderData, date],
  );
  const requestsData = requestsQuery.isPlaceholderData ? undefined : requestsQuery.data;
  const openShifts = useMemo(
    () => buildDayOpenShifts(requestsData?.openShifts ?? [], date, viewerEmpId),
    [requestsData, date, viewerEmpId],
  );
  const requests = useMemo(
    () =>
      buildDayRequests(requestsData?.requests ?? [], date, {
        viewerEmpId,
        canSeeAll: canSeeAllRequests,
      }),
    [requestsData, date, viewerEmpId, canSeeAllRequests],
  );
  const viewerDay = useMemo(
    () => findViewerDay(entries, date, viewerEmpId),
    [entries, date, viewerEmpId],
  );
  const roster = useMemo(
    () => (showRoster ? buildDayRoster(entries, date) : []),
    [showRoster, entries, date],
  );
  // Only a day the viewer works is said: not being on it shows already.
  const showsViewerDay =
    viewerEmpId !== null && viewerDay !== null && (showViewerDay ?? !showsCoverage);
  const isSettled =
    requestsData !== undefined && (!showsCoverage || dashboardQuery.data !== undefined);
  const isEmpty =
    isSettled &&
    !showsViewerDay &&
    coverage.length === 0 &&
    openShifts.length === 0 &&
    requests.length === 0 &&
    roster.length === 0;

  return (
    <Screen bottomPaddingMode="tabbed">
      <View style={styles.page}>
        {showDate ? (
          <AppText accessibilityRole="header" variant="screenTitle">
            {formatScheduleDayLabel(date, now, timeZone)}
          </AppText>
        ) : null}
        {showsViewerDay && viewerDay ? (
          <View style={styles.viewerDay}>
            <AppText style={styles.brandText} variant="meta">
              You work this day
            </AppText>
            <AppText variant="rowTitle">
              {[viewerDay.title, viewerDay.time].filter(Boolean).join(" · ")}
            </AppText>
          </View>
        ) : null}
        {coverage.length > 0 ? (
          <Section title="Coverage" styles={styles}>
            {coverage.map((row, index) => {
              const pct = Math.round((row.filled / row.required) * 100);
              return (
                <View
                  key={row.focusAreaId}
                  accessibilityLabel={`${row.name}, ${row.filled} of ${row.required} filled`}
                  accessible
                  style={[styles.row, index > 0 && styles.rowDivider]}
                >
                  <View style={styles.rowLine}>
                    <AppText numberOfLines={1} style={styles.rowGrow} variant="rowTitle">
                      {row.name}
                    </AppText>
                    <AppText tone="secondary" variant="meta">
                      {`${row.filled} of ${row.required} filled`}
                    </AppText>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        {
                          backgroundColor: coverageColor(mobileColors, pct),
                          width: `${Math.min(100, pct)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </Section>
        ) : null}
        {openShifts.length > 0 ? (
          <Section title="Open shifts" styles={styles}>
            {openShifts.map((openShift, index) => (
              <View
                key={openShift.id}
                style={[styles.row, styles.rowLine, index > 0 && styles.rowDivider]}
              >
                <View style={styles.rowGrow}>
                  <AppText variant="rowTitle">{openShift.title}</AppText>
                  {openShift.detail ? (
                    <AppText tone="secondary" variant="meta">
                      {openShift.detail}
                    </AppText>
                  ) : null}
                </View>
                {openShift.canClaim ? (
                  <View style={styles.pill}>
                    <AppText
                      maxFontSizeMultiplier={MAX_FONT_SCALE_COMPACT}
                      numberOfLines={1}
                      style={styles.brandText}
                      variant="badge"
                    >
                      You can claim
                    </AppText>
                  </View>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}
        {requests.length > 0 ? (
          <Section title="Requests this day" styles={styles}>
            {requests.map((request, index) => (
              <PressableRow
                key={request.id}
                accessibilityLabel={`${request.who}, ${request.detail}`}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/requests",
                    params: {
                      requestId: request.id,
                      ...(request.tab ? { tab: request.tab } : {}),
                    },
                  })
                }
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <AppText variant="rowTitle">{request.who}</AppText>
                <AppText tone="secondary" variant="meta">
                  {request.detail}
                </AppText>
              </PressableRow>
            ))}
          </Section>
        ) : null}
        {roster.length > 0 ? (
          <Section title="Working" styles={styles}>
            {roster.map((shift, index) => (
              <View key={shift.key} style={[styles.row, index > 0 && styles.rowDivider]}>
                <AppText variant="rowTitle">
                  {[shift.title, shift.focusArea, shift.time].filter(Boolean).join(" · ")}
                </AppText>
                {shift.names.map((name, nameIndex) => (
                  <AppText key={`${name}-${nameIndex}`} tone="secondary" variant="body">
                    {name}
                  </AppText>
                ))}
              </View>
            ))}
          </Section>
        ) : null}
        {isEmpty ? (
          <AppText tone="secondary" variant="body">
            {showRoster ? "Nobody works this day." : "No open shifts or requests this day."}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

function Section({
  title,
  styles,
  children,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <AppText accessibilityRole="header" variant="sectionTitle">
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    page: {
      gap: mobileSpace.xl,
      paddingTop: mobileSpace.lg,
    },
    viewerDay: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      gap: mobileSpace.xs,
      padding: mobileSpace.lg,
    },
    brandText: {
      color: mobileColors.brand,
    },
    section: {
      gap: mobileSpace.sm,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      overflow: "hidden",
    },
    row: {
      gap: mobileSpace.xs,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    rowDivider: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowLine: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    rowGrow: {
      flex: 1,
      gap: mobileSpace.xs,
    },
    track: {
      backgroundColor: mobileColors.surfaceMuted,
      borderRadius: mobileRadii.pill,
      height: 6,
      marginTop: mobileSpace.xs,
      overflow: "hidden",
    },
    fill: {
      borderRadius: mobileRadii.pill,
      height: 6,
    },
    pill: {
      backgroundColor: mobileColors.brandSoft,
      borderRadius: mobileRadii.pill,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
  });
}
