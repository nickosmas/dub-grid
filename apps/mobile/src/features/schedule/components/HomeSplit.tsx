import type { MobileScheduleEntry, MobileScheduleRange } from "@dubgrid/contracts";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { PUSHED_BY_FOLD_PARAM, shouldPushPickOnClose } from "../../../shared/layout/fold-rule";
import { useSplitLayout } from "../../../shared/layout/SplitView";
import type { SplitLayout } from "../../../shared/layout/split-layout";
import ShiftDetailScreen from "../screens/ShiftDetailScreen";
import { formatSplitDayTitle } from "../lib/week-range-label";
import { HomeDayPane } from "./HomeDayPane";

type OpenShift = { employeeId: string; date: string };

/**
 * My schedule as a split view on an open iPhone Duo (both Homes): the week
 * beside one day of it, the day picked or, before a pick, the shift now or
 * next, else today. A shift opened from the day sits over it with Back;
 * folding closed with one open pushes its page, and a day gives way to the list.
 */
export function useHomeSplit({
  enabled,
  range,
  defaultEntry,
  defaultDate,
}: {
  enabled: boolean;
  range: MobileScheduleRange;
  defaultEntry: MobileScheduleEntry | null;
  defaultDate: string;
}): {
  split: SplitLayout | null;
  /** The day beside the week. */
  day: string;
  /** A shift opened from that day, shown over it. */
  shift: OpenShift | null;
  highlightedDate: string | null;
  pickDay: (date: string) => void;
  /** A row of the week: its day, beside the list. */
  pickShift: (entry: MobileScheduleEntry) => void;
  openShift: (entry: MobileScheduleEntry) => void;
  closeShift: () => void;
} {
  const layout = useSplitLayout();
  const split = enabled ? layout : null;
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const inRange = (date: string) => date >= range.startDate && date <= range.endDate;
  const day =
    pickedDate && inRange(pickedDate)
      ? pickedDate
      : (defaultEntry?.date ?? (inRange(defaultDate) ? defaultDate : range.startDate));
  const shift = openShift && openShift.date === day ? openShift : null;

  const isSplit = split !== null;
  const isFocused = useIsFocused();
  const wasSplitRef = useRef(isSplit);
  useEffect(() => {
    const wasSplit = wasSplitRef.current;
    wasSplitRef.current = isSplit;
    if (!isFocused || !shift) return;
    const pickedId = `${shift.employeeId}:${shift.date}`;
    if (shouldPushPickOnClose({ wasSplit, isSplit, pickedId })) {
      router.push({
        pathname: "/shift/[employeeId]/[date]",
        params: {
          employeeId: shift.employeeId,
          date: shift.date,
          rangeStart: range.startDate,
          rangeEnd: range.endDate,
          source: "mine",
          [PUSHED_BY_FOLD_PARAM]: "1",
        },
      });
    }
  }, [isSplit, isFocused, shift, range.startDate, range.endDate]);

  const pickDay = (date: string) => {
    setPickedDate(date);
    setOpenShift(null);
  };
  return {
    split,
    day,
    shift: split ? shift : null,
    highlightedDate: split ? day : null,
    pickDay,
    pickShift: (entry) => pickDay(entry.date),
    openShift: (entry) => {
      setPickedDate(entry.date);
      setOpenShift({ employeeId: entry.employeeId, date: entry.date });
    },
    closeShift: () => setOpenShift(null),
  };
}

/** The right pane for `useHomeSplit`: the day, or a shift opened from it. */
export function HomeSplitPane({
  home,
  range,
  todayDate,
  currentTime,
  entries,
  teamEntries,
}: {
  home: ReturnType<typeof useHomeSplit>;
  range: MobileScheduleRange;
  todayDate: string;
  /** "HH:MM" in the organization's zone. */
  currentTime: string;
  entries: readonly MobileScheduleEntry[];
  teamEntries: MobileScheduleEntry[];
}) {
  if (home.shift) {
    return (
      <ShiftDetailScreen
        key={`${home.shift.employeeId}:${home.shift.date}`}
        back={{ label: formatSplitDayTitle(home.day, todayDate), onPress: home.closeShift }}
        embedded
        shift={{
          employeeId: home.shift.employeeId,
          date: home.shift.date,
          rangeStart: range.startDate,
          rangeEnd: range.endDate,
          source: "mine",
        }}
      />
    );
  }
  return (
    <HomeDayPane
      key={home.day}
      date={home.day}
      entries={entries}
      teamEntries={teamEntries}
      currentTime={currentTime}
      todayDate={todayDate}
      onOpenEntry={home.openShift}
    />
  );
}
