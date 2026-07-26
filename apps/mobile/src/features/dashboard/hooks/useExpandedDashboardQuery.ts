import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { getDashboardPeriodRange, type DashboardPeriodMode } from "../../../shared/lib/dates";
import { useAdminDashboard } from "./useAdminDashboard";

function toDashboardPeriodMode(value: string | string[] | undefined): DashboardPeriodMode {
  return value === "day" || value === "2weeks" ? value : "week";
}

/**
 * Shared data source for the full-page expanded dashboard routes
 * (coverage/open-shifts/staff-hours/activity/pending-approvals). Recomputes
 * the exact same range AdminHomeScreen used (periodMode passed as a route
 * param) so useAdminDashboard's query key matches and react-query serves it
 * straight from cache — no extra network round trip when navigating from an
 * already-warm Home tab, while still resolving on its own if opened cold
 * (e.g. a deep link).
 */
export function useExpandedDashboardQuery() {
  const { periodMode: rawPeriodMode } = useLocalSearchParams<{ periodMode?: string }>();
  const periodMode = toDashboardPeriodMode(rawPeriodMode);
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const payPeriodStartDate = bootstrapQuery.data?.currentOrg?.payPeriodStartDate ?? null;
  const range = useMemo(
    () => getDashboardPeriodRange(periodMode, new Date(), payPeriodStartDate),
    [periodMode, payPeriodStartDate],
  );
  const dashboardQuery = useAdminDashboard(accessToken, range);

  return { dashboardQuery, bootstrapQuery, periodMode };
}
