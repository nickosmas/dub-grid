"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getZonedDayRangeUtc } from "@dubgrid/schedule-core";
import { useOrgTodayDate } from "@/hooks";
import {
  formatActivityPeriodLabel,
  formatActivityPeriodPhrase,
  getActivityPeriod,
  isCurrentActivityPeriod,
  parseActivityPeriodParams,
  shiftActivityPeriod,
  type ActivityPeriod,
  type ActivityPeriodUnit,
} from "@/lib/activity-period";

export interface ActivityPeriodState {
  period: ActivityPeriod;
  unit: ActivityPeriodUnit;
  anchorDate: string;
  todayDate: string;
  label: string;
  phrase: string;
  isCurrent: boolean;
  nextDisabled: boolean;
  /** UTC bounds for the query, covering whole days in the org's zone. */
  startAt: string;
  endAt: string;
  setUnit: (unit: ActivityPeriodUnit) => void;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  jumpTo: (date: string) => void;
}

interface ActivityPeriodOptions {
  timeZone: string | null;
  defaultUnit?: ActivityPeriodUnit;
  /**
   * Where to open before the reader navigates. Views holding sparse history
   * point this at their most recent event so the first screen is never empty.
   */
  initialAnchorDate?: string | null;
}

/**
 * Which slice of time an activity view is showing, in the organization's zone.
 *
 * Period state lives in component state. Views that want the period to survive
 * a refresh and be shareable use `useUrlActivityPeriod` instead; keeping the
 * two apart means a view that does not need the URL never depends on the app
 * router, and so still renders outside one.
 */
export function useActivityPeriod({
  timeZone,
  defaultUnit = "week",
  initialAnchorDate = null,
}: ActivityPeriodOptions): ActivityPeriodState {
  const todayDate = useOrgTodayDate(timeZone);
  const [state, setState] = useState<{ unit: ActivityPeriodUnit; anchorDate: string | null }>({
    unit: defaultUnit,
    anchorDate: null,
  });

  const commit = useCallback((unit: ActivityPeriodUnit, anchorDate: string) => {
    setState({ unit, anchorDate });
  }, []);

  return buildActivityPeriodState({
    unit: state.unit,
    anchorDate: state.anchorDate ?? initialAnchorDate ?? todayDate,
    todayDate,
    timeZone,
    commit,
  });
}

/**
 * The same period state, kept in the query string. An audit trail is worth
 * linking to, so a specific day has to survive a refresh and paste into a
 * message.
 */
export function useUrlActivityPeriod({
  timeZone,
  defaultUnit = "week",
}: ActivityPeriodOptions): ActivityPeriodState {
  const todayDate = useOrgTodayDate(timeZone);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsed = useMemo(
    () =>
      parseActivityPeriodParams(
        { period: searchParams.get("period"), date: searchParams.get("date") },
        todayDate,
      ),
    [searchParams, todayDate],
  );

  const commit = useCallback(
    (unit: ActivityPeriodUnit, anchorDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("period", unit);
      params.set("date", anchorDate);
      // `replace` so stepping through periods does not fill the back button.
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return buildActivityPeriodState({
    unit: parsed.unit ?? defaultUnit,
    anchorDate: parsed.anchorDate,
    todayDate,
    timeZone,
    commit,
  });
}

function buildActivityPeriodState({
  unit,
  anchorDate,
  todayDate,
  timeZone,
  commit,
}: {
  unit: ActivityPeriodUnit;
  anchorDate: string;
  todayDate: string;
  timeZone: string | null;
  commit: (unit: ActivityPeriodUnit, anchorDate: string) => void;
}): ActivityPeriodState {
  const period = getActivityPeriod(unit, anchorDate);
  const { startAt, endAt } = getZonedDayRangeUtc(period.startDate, period.endDate, timeZone);

  return {
    period,
    unit,
    anchorDate,
    todayDate,
    label: formatActivityPeriodLabel(period),
    phrase: formatActivityPeriodPhrase(period, todayDate),
    isCurrent: isCurrentActivityPeriod(period, todayDate),
    // Nothing is recorded in the future, so a later period is always empty.
    nextDisabled: period.endDate >= todayDate,
    startAt,
    endAt,
    setUnit: (nextUnit) => commit(nextUnit, anchorDate),
    goPrev: () => commit(unit, shiftActivityPeriod(period, -1).startDate),
    goNext: () => commit(unit, shiftActivityPeriod(period, 1).startDate),
    goToday: () => commit(unit, todayDate),
    jumpTo: (date) => commit(unit, date),
  };
}
