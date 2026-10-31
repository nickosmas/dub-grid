import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { getIsoDateInTimeZone, getScheduleRangeForDate } from "@dubgrid/schedule-core";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useAdminDashboard } from "./useAdminDashboard";

function toWeekOf(value: string | string[] | undefined): string | null {
  const weekOf = Array.isArray(value) ? value[0] : value;
  return weekOf && /^\d{4}-\d{2}-\d{2}$/.test(weekOf) ? weekOf : null;
}

/**
 * Shared data source for the full-page expanded dashboard routes
 * (coverage/open-shifts/staff-hours/activity/pending-approvals). Recomputes
 * the exact same week AdminHomeScreen showed (its first day passed as the
 * `weekOf` route param) so useAdminDashboard's query key matches and
 * react-query serves it straight from cache — no extra network round trip when
 * navigating from an already-warm Home tab, while still resolving on its own
 * if opened cold (e.g. a deep link), on this week.
 */
export function useExpandedDashboardQuery() {
  const { weekOf: rawWeekOf } = useLocalSearchParams<{ weekOf?: string }>();
  const weekOf = toWeekOf(rawWeekOf);
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const timeZone = bootstrapQuery.data?.currentOrg?.timezone ?? null;
  const range = useMemo(
    () => getScheduleRangeForDate(weekOf ?? getIsoDateInTimeZone(new Date(), timeZone)),
    [timeZone, weekOf],
  );
  const dashboardQuery = useAdminDashboard(accessToken, range);

  return { dashboardQuery, bootstrapQuery };
}
