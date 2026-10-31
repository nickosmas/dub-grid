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
import { getMobileRequestActionKey } from "../../shift-requests/lib/request-action-feedback";
import type { RequestActionBody } from "../../shift-requests/hooks/useShiftRequestActionFlow";
import type { MyHomeSectionsData } from "../hooks/useMyHomeSections";
import type { OpenShift, OpenShiftClaim } from "./OpenShiftsCard";

/**
 * Whether the You group has anything to show for the period: a shift of
 * theirs, or a swap waiting on them. Removed shifts are history, not a day.
 */
export function hasMyHomeContent(data: MyHomeSectionsData): boolean {
  if (!data.isOn) return false;
  if (data.scheduleError || data.entries.some((entry) => !isDeletedScheduleHistory(entry))) {
    return true;
  }
  return (
    buildMeShiftRequestSections({
      linkedEmployeeId: data.linkedEmployeeId,
      requests: data.requests,
      timeZone: data.timeZone,
    }).coverRequests.length > 0
  );
}

function claimBody(shift: OpenShift, empId: string): RequestActionBody {
  return {
    action: "volunteer_open_shift",
    empId,
    shiftDate: shift.date,
    focusAreaId: shift.focusAreaId,
    state: shift.state,
  };
}

/**
 * Claim on the team's Open shifts for someone who works shifts themselves.
 * The team's list keeps every gap; whether this person can take one comes
 * from their own open-shift feed, matched by focus area and day, so a gap with
 * several jobs offers the one they qualify for.
 */
export function buildOpenShiftClaim(data: MyHomeSectionsData): OpenShiftClaim | undefined {
  const empId = data.linkedEmployeeId;
  if (!data.isOn || !empId) return undefined;

  const claimable = data.openShifts.filter((shift) => shift.canVolunteer);
  if (claimable.length === 0) return undefined;

  return {
    shiftFor: (row) =>
      claimable.find((shift) => shift.id === row.id) ??
      claimable.find((shift) => shift.focusAreaId === row.focusAreaId && shift.date === row.date) ??
      null,
    isClaiming: (shift) =>
      data.pendingAction?.key === getMobileRequestActionKey(shift.id, claimBody(shift, empId)),
    isBusy: data.pendingAction !== null,
    onClaim: (shift) => data.runRequestAction(shift.id, claimBody(shift, empId)),
  };
}

/**
 * The staff Home's personal sections on the admin Home: the shift now or
 * next, swaps asked of them, then every day of the week.
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
  const coverRequests = useMemo(
    () =>
      buildMeShiftRequestSections({
        linkedEmployeeId,
        requests: data.requests,
        now,
        timeZone,
      }).coverRequests,
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
      <UpcomingShiftsSection
        items={upcomingItems}
        summary={weeklyHours}
        todayDate={todayDate}
        weekDays={weekDays}
        onPressEntry={openShiftDetail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The dashboard's own rhythm between cards, so the two groups read as one page.
  sections: {
    gap: mobileSpacing.sectionGap,
  },
});
