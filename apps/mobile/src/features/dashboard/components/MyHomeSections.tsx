import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { MobileScheduleEntry, MobileScheduleRange } from "@dubgrid/contracts";
import {
  buildMeShiftRequestSections,
  buildScheduleWeekDays,
  buildUpcomingMeScheduleItems,
  buildWeeklyHoursSummary,
  getFeaturedMeScheduleSegment,
  getIsoDateInTimeZone,
  getScheduleEntryEndTime,
  getScheduleEntryStartTime,
  isDeletedScheduleHistory,
} from "@dubgrid/schedule-core";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { queryClient } from "../../../shared/lib/query-client";
import { mobileSpacing } from "../../../shared/theme/tokens";
import {
  MeHeroCard,
  OpenShiftsSection,
  ShiftCoverRequestsSection,
  UpcomingShiftsSection,
} from "../../schedule/components/MyScheduleSections";
import { getMeHeroShiftmates } from "../../schedule/lib/scheduleScreenChips";
import {
  getCurrentTimeValue,
  getHeroTiming,
  getSegmentEndTime,
  getSegmentStartTime,
} from "../../schedule/lib/scheduleScreenHelpers";
import type { MyHomeSectionsData } from "../hooks/useMyHomeSections";

/**
 * The staff Home's personal sections on the admin Home: the shift now or
 * next, swaps asked of them, every gap in the team with Claim where they can
 * work it, then every day of the week.
 */
export function MyHomeSections({
  data,
  range,
  selectedDate,
}: {
  data: MyHomeSectionsData;
  range: MobileScheduleRange;
  /** The header stepper's day; the hero reads the week from it, as on the staff Home. */
  selectedDate: string;
}) {
  const now = useRealtimeNow();
  const { entries, linkedEmployeeId, timeZone } = data;
  const todayDate = getIsoDateInTimeZone(now, timeZone);
  const currentTime = getCurrentTimeValue(now, timeZone);

  const hero = useMemo(
    () =>
      getFeaturedMeScheduleSegment({
        entries,
        rangeStartDate: range.startDate,
        selectedDate,
        todayDate,
        currentTime,
      }),
    [currentTime, entries, range.startDate, selectedDate, todayDate],
  );
  const heroTiming = hero.item
    ? getHeroTiming(
        hero.item.entry,
        getSegmentStartTime(hero.item.segment) ?? getScheduleEntryStartTime(hero.item.entry),
        getSegmentEndTime(hero.item.segment) ?? getScheduleEntryEndTime(hero.item.entry),
        hero.status,
        todayDate,
        currentTime,
      )
    : null;
  const shiftmates = useMemo(
    () => getMeHeroShiftmates(hero.item, data.teamEntries),
    [data.teamEntries, hero.item],
  );
  const { coverRequests, openShiftRequests } = useMemo(
    () =>
      buildMeShiftRequestSections({
        linkedEmployeeId,
        requests: data.requests,
        now,
        timeZone,
      }),
    [data.requests, linkedEmployeeId, now, timeZone],
  );
  const weekDays = useMemo(
    () => buildScheduleWeekDays(range, selectedDate, timeZone, now),
    [now, range, selectedDate, timeZone],
  );
  const upcomingItems = useMemo(
    () => buildUpcomingMeScheduleItems({ entries, featuredItem: hero.item, selectedDate }),
    [entries, hero.item, selectedDate],
  );
  const weeklyHours = useMemo(() => buildWeeklyHoursSummary(entries, 40), [entries]);
  const hasScheduledDay = entries.some((entry) => !isDeletedScheduleHistory(entry));

  const openShiftDetail = (entry: MobileScheduleEntry) => {
    // Shift detail reads `/me/schedule` under the schedule key for this range;
    // handing it this copy puts the shift on screen before its own fetch.
    if (data.scheduleResponse) {
      queryClient.setQueryData(
        mobileQueryKeys.schedule(data.accessToken, "mine", range),
        data.scheduleResponse,
      );
    }
    router.push({
      pathname: "/shift/[employeeId]/[date]",
      params: {
        employeeId: entry.employeeId,
        date: entry.date,
        rangeStart: range.startDate,
        rangeEnd: range.endDate,
        source: "mine",
      },
    });
  };

  return (
    <View style={styles.sections}>
      <MeHeroCard
        currentDate={todayDate}
        currentTime={currentTime}
        featuredItem={hero.item}
        hasWeekItems={hasScheduledDay}
        shiftmates={shiftmates}
        status={hero.status}
        timing={heroTiming}
        onPress={hero.item ? () => openShiftDetail(hero.item!.entry) : undefined}
      />
      <ShiftCoverRequestsSection
        linkedEmployeeId={linkedEmployeeId}
        pendingAction={data.pendingAction}
        requests={coverRequests}
        requestsError={data.requestsError}
        onRespond={(requestId, accept) => {
          if (!linkedEmployeeId) return;
          data.runRequestAction(requestId, { action: "respond", empId: linkedEmployeeId, accept });
        }}
      />
      <OpenShiftsSection
        linkedEmployeeId={linkedEmployeeId}
        now={now}
        openShifts={data.openShifts}
        pendingAction={data.pendingAction}
        requests={openShiftRequests}
        requestsError={data.requestsError}
        scheduleEntries={entries}
        showEveryGap
        timeZone={timeZone}
        onClaim={(requestId) => {
          if (!linkedEmployeeId) return;
          data.runRequestAction(requestId, { action: "claim", claimerEmpId: linkedEmployeeId });
        }}
        onSeeAll={() => router.push("/(tabs)/requests")}
        onVolunteer={(openShift) => {
          if (!linkedEmployeeId) return;
          data.runRequestAction(openShift.id, {
            action: "volunteer_open_shift",
            empId: linkedEmployeeId,
            shiftDate: openShift.date,
            focusAreaId: openShift.focusAreaId,
            state: openShift.state,
          });
        }}
      />
      {/* A week with nothing in it is the empty state above alone, not that
          and seven Unscheduled days, as the Schedule tab already does. */}
      {hasScheduledDay ? (
        <UpcomingShiftsSection
          items={upcomingItems}
          summary={weeklyHours}
          todayDate={todayDate}
          weekDays={weekDays}
          onPressEntry={openShiftDetail}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The dashboard's own rhythm between cards, so the two groups read as one page.
  sections: {
    gap: mobileSpacing.sectionGap,
  },
});
