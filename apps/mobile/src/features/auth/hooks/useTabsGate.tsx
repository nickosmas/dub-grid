import { type ReactNode } from "react";
import { Redirect } from "expo-router";
import { AppSplashScreen } from "../../../shared/components/AppSplashScreen";
import { useBootstrap } from "./useBootstrap";
import { OrganizationLockedScreen } from "../screens/OrganizationLockedScreen";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";
import { usePushResponseHandler } from "../../notifications/hooks/usePushResponseHandler";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { getOrgUnavailableMessage } from "../../../shared/lib/errors";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { isManagementOnly, isOnSchedule } from "./employmentStatus";

export type TabsGateResult =
  | { kind: "blocked"; element: ReactNode }
  | {
      kind: "ready";
      canViewTeamSchedule: boolean;
      canViewRequestsTab: boolean;
      canViewHomeTab: boolean;
    };

export function isAdminHomeRole(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function useTabsGate(): TabsGateResult {
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const lockedMessage = getOrgUnavailableMessage(bootstrapQuery.error);
  usePushRegistration(accessToken, lockedMessage ? null : bootstrapQuery.data?.currentOrg.id);
  usePushResponseHandler(Boolean(accessToken));

  // No explicit AppState listener here: `NetworkStateProvider` drives
  // react-query's `focusManager`, which already refetches bootstrap on
  // foreground once it's past `staleTime`. The listener this replaced also
  // depended on the whole query object, so it was torn down and re-added on
  // every render.

  // Bootstrap blocks alongside the session, because until it lands nobody
  // knows who this is. The Home tab has to pick between the admin dashboard
  // and the personal schedule, and defaulting to one meant an admin got the
  // schedule's skeleton first and the dashboard's second — two waves, the
  // first of them the wrong shape. The tab bar has the same problem: every
  // `canView*` below is false while bootstrap is in flight, so tabs popped in
  // afterwards.
  //
  // `isLoading` (not `isFetching`) so this is the cold first load only —
  // refetches and org switches keep showing the screen you are on.
  if (isLoading || bootstrapQuery.isLoading) {
    return {
      kind: "blocked",
      element: <AppSplashScreen />,
    };
  }

  if (!accessToken) {
    return { kind: "blocked", element: <Redirect href="/(auth)/login" /> };
  }

  if (lockedMessage) {
    return {
      kind: "blocked",
      element: (
        <OrganizationLockedScreen
          accessToken={accessToken}
          isRetrying={bootstrapQuery.isFetching}
          message={lockedMessage}
          onRetry={() => {
            void bootstrapQuery.refetch();
          }}
          onSignOut={() => {
            void handleExpiredMobileSession();
          }}
        />
      ),
    };
  }

  const focusAreaIds = bootstrapQuery.data?.linkedEmployee?.focusAreaIds ?? [];
  const departmentIds = bootstrapQuery.data?.linkedEmployee?.departmentIds ?? [];
  // A management-only regular user (not admin/super_admin) has no personal
  // schedule and no admin dashboard to show — the personal-schedule Home tab
  // is irrelevant to them, so it's hidden and the Schedule (team) tab becomes
  // their first tab instead.
  const isManagementOnlyUser =
    bootstrapQuery.data?.effectiveRole === "user" && isManagementOnly(focusAreaIds, departmentIds);

  return {
    kind: "ready",
    canViewTeamSchedule: bootstrapQuery.data?.permissions.canViewSchedule ?? false,
    canViewRequestsTab:
      isOnSchedule(focusAreaIds) ||
      Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests),
    canViewHomeTab: !isManagementOnlyUser,
  };
}
