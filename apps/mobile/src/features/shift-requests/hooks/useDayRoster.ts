import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getScheduleRangeForDate } from "@dubgrid/schedule-core";
import { getOrgSchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { buildDayRoster, type DayRosterShift } from "../lib/day-roster";

/**
 * Who works each shift on a request's day. Reads the team's week under the
 * Schedule tab's own query key, so a week already open there costs nothing.
 * Null for someone who can't see the team schedule.
 */
export function useDayRoster(
  date: string | null,
  affectedIds?: ReadonlySet<string>,
): {
  shifts: DayRosterShift[] | null;
  isLoading: boolean;
} {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const canViewSchedule = Boolean(bootstrapQuery.data?.permissions.canViewSchedule);
  const range = useMemo(() => (date ? getScheduleRangeForDate(date) : null), [date]);
  const query = useQuery({
    queryKey: mobileQueryKeys.schedule(
      accessToken,
      "team",
      range ?? { startDate: "", endDate: "" },
    ),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, range!, signal),
    enabled: Boolean(accessToken && range && canViewSchedule),
  });
  const shifts = useMemo(
    () => (query.data && date ? buildDayRoster(query.data.entries, date, affectedIds) : null),
    [query.data, date, affectedIds],
  );
  return { shifts: canViewSchedule ? shifts : null, isLoading: canViewSchedule && query.isLoading };
}
