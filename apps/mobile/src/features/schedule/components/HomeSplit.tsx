import type { MobileScheduleEntry, MobileScheduleRange } from "@dubgrid/contracts";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { PUSHED_BY_FOLD_PARAM, shouldPushPickOnClose } from "../../../shared/layout/fold-rule";
import { useSplitLayout } from "../../../shared/layout/SplitView";
import type { SplitLayout } from "../../../shared/layout/split-layout";
import ShiftDetailScreen from "../screens/ShiftDetailScreen";
import type { PaneBack } from "../../../shared/layout/PaneTitle";
import { DayOverview } from "./DayOverview";

/** What My schedule shows beside the list: a shift's page, or a day off's overview. */
export type HomePick =
  { kind: "shift"; employeeId: string; date: string } | { kind: "day"; date: string };

/**
 * My schedule as a split view on an open iPhone Duo (both Homes). Before a
 * pick the right pane is the shift now or next, or, with none this week, the
 * day's overview. A pick stays with its week; folding closed with a picked
 * shift pushes its page, and a day or the default gives way to the list.
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
  shown: HomePick;
  /** What was tapped, which opens over Home beside the month; null for Home itself. */
  picked: HomePick | null;
  clearPick: () => void;
  highlightedDate: string | null;
  pickShift: (entry: MobileScheduleEntry) => void;
  pickDay: (date: string) => void;
} {
  const layout = useSplitLayout();
  const split = enabled ? layout : null;
  const [pick, setPick] = useState<HomePick | null>(null);
  const livePick = pick && pick.date >= range.startDate && pick.date <= range.endDate ? pick : null;
  const shown: HomePick =
    livePick ??
    (defaultEntry
      ? { kind: "shift", employeeId: defaultEntry.employeeId, date: defaultEntry.date }
      : { kind: "day", date: defaultDate });

  const isSplit = split !== null;
  const isFocused = useIsFocused();
  const wasSplitRef = useRef(isSplit);
  useEffect(() => {
    const wasSplit = wasSplitRef.current;
    wasSplitRef.current = isSplit;
    if (!isFocused || livePick?.kind !== "shift") return;
    const pickedId = `${livePick.employeeId}:${livePick.date}`;
    if (shouldPushPickOnClose({ wasSplit, isSplit, pickedId })) {
      router.push({
        pathname: "/shift/[employeeId]/[date]",
        params: {
          employeeId: livePick.employeeId,
          date: livePick.date,
          rangeStart: range.startDate,
          rangeEnd: range.endDate,
          source: "mine",
          [PUSHED_BY_FOLD_PARAM]: "1",
        },
      });
    }
  }, [isSplit, isFocused, livePick, range.startDate, range.endDate]);

  return {
    split,
    shown,
    picked: split ? livePick : null,
    clearPick: () => setPick(null),
    highlightedDate: split && livePick ? livePick.date : null,
    pickShift: (entry) =>
      setPick({ kind: "shift", employeeId: entry.employeeId, date: entry.date }),
    pickDay: (date) => setPick({ kind: "day", date }),
  };
}

/** The right pane for `useHomeSplit`. */
export function HomeSplitPane({
  shown,
  range,
  now,
  back,
}: {
  shown: HomePick;
  range: MobileScheduleRange;
  now: Date;
  back?: PaneBack;
}) {
  if (shown.kind === "shift") {
    return (
      <ShiftDetailScreen
        key={`${shown.employeeId}:${shown.date}`}
        back={back}
        embedded
        shift={{
          employeeId: shown.employeeId,
          date: shown.date,
          rangeStart: range.startDate,
          rangeEnd: range.endDate,
          source: "mine",
        }}
      />
    );
  }
  return (
    <DayOverview
      key={shown.date}
      date={shown.date}
      now={now}
      range={range}
      showRoster
      showViewerDay={false}
      back={back}
    />
  );
}
