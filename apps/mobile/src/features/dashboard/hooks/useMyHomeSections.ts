import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileScheduleRange } from "@dubgrid/contracts";
import { getOrgSchedule, getShiftRequests } from "../../../shared/lib/api";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useMobileShiftRequestsRealtime } from "../../shift-requests/hooks/useMobileShiftRequestsRealtime";
import { useShiftRequestActionFlow } from "../../shift-requests/hooks/useShiftRequestActionFlow";
import { useMyScheduleQuery } from "./useMyScheduleQuery";

/**
 * What the admin Home's You group reads for the period: the person's own
 * shifts, the team's (for who they work with) and the requests asked of them,
 * with the staff Home's respond and claim flow. Off for someone with no staff profile or
 * no schedule of their own.
 */
export function useMyHomeSections({
  accessToken,
  range,
  enabled,
}: {
  accessToken: string | null;
  range: MobileScheduleRange;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap(accessToken);
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const isOn = enabled && Boolean(accessToken) && linkedEmployee !== null;
  const canViewTeam = Boolean(bootstrapQuery.data?.permissions.canViewSchedule);

  const scheduleQuery = useMyScheduleQuery(accessToken, { enabled: isOn, range });
  const teamQuery = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "team", range),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, range, signal),
    enabled: isOn && canViewTeam,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  const requestsQuery = useQuery({
    queryKey: mobileQueryKeys.shiftRequests(accessToken, range),
    queryFn: ({ signal }) => getShiftRequests(accessToken!, range, signal),
    enabled: isOn,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });

  const refetchSchedule = scheduleQuery.refetch;
  const refetchTeam = teamQuery.refetch;
  const refetchRequests = requestsQuery.refetch;
  const refetch = useCallback(() => {
    if (!isOn) return Promise.resolve();
    return Promise.all([
      refetchSchedule(),
      refetchRequests(),
      ...(canViewTeam ? [refetchTeam()] : []),
    ]);
  }, [canViewTeam, isOn, refetchRequests, refetchSchedule, refetchTeam]);

  useMobileShiftRequestsRealtime({
    orgId: bootstrapQuery.data?.currentOrg?.id ?? null,
    disabled: !isOn,
    onChange: () => {
      void refetchRequests();
    },
  });

  const { pendingAction, runRequestAction, confirmationModal } = useShiftRequestActionFlow({
    accessToken,
    viewerCanApprove: Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests),
    // A claim changes the team's numbers too, so the dashboard reloads with it.
    onSucceeded: () =>
      Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["mobile", "dashboard"] }),
      ]),
  });

  // "Resolved", not "succeeded", as on the staff Home: a failed fetch shows
  // its own message in its section rather than taking Home to an error.
  const isResolved = (query: { data: unknown; error: unknown }, on: boolean) =>
    !on || query.data !== undefined || Boolean(query.error);

  return {
    accessToken,
    isOn,
    isResolved:
      isResolved(scheduleQuery, isOn) &&
      isResolved(requestsQuery, isOn) &&
      isResolved(teamQuery, isOn && canViewTeam),
    isLoading: isOn && (scheduleQuery.isLoading || requestsQuery.isLoading),
    isPlaceholderData: scheduleQuery.isPlaceholderData || requestsQuery.isPlaceholderData,
    linkedEmployeeId: linkedEmployee?.id ?? null,
    timeZone: bootstrapQuery.data?.currentOrg?.timezone ?? null,
    entries: scheduleQuery.data?.entries ?? [],
    scheduleError: scheduleQuery.error,
    teamEntries: teamQuery.data?.entries ?? [],
    requests: requestsQuery.data?.requests ?? [],
    /** Open shifts with `canVolunteer` worked out for this person. */
    openShifts: requestsQuery.data?.openShifts ?? [],
    requestsError: requestsQuery.error,
    scheduleResponse: scheduleQuery.data,
    refetch,
    pendingAction,
    runRequestAction,
    confirmationModal,
  };
}

export type MyHomeSectionsData = ReturnType<typeof useMyHomeSections>;
