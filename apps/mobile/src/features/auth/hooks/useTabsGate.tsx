import { type ReactNode } from "react";
import { Redirect } from "expo-router";
import { useBootstrap } from "./useBootstrap";
import { OrganizationLockedScreen } from "../screens/OrganizationLockedScreen";
import { NetworkConnectionRecoveryScreen } from "../screens/NetworkConnectionRecoveryScreen";
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

  // Renders nothing rather than a splash: `StartupSplashGate` owns the one
  // splash instance and is still covering the screen whenever this is reached
  // on a cold launch. A second instance here restarted the whole brand
  // animation mid-handoff, which is what read as a double splash.
  //
  // `isLoading` (not `isFetching`) so this is the cold first load only —
  // refetches and org switches keep showing the screen you are on. This is
  // strictly about the session itself; not knowing `accessToken` yet means
  // the redirect-to-login decision right below can't be made.
  if (isLoading) {
    return { kind: "blocked", element: null };
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

  // Only when there is nothing to show. A refetch that fails while the tab tree
  // is already populated must not replace the navigator: returning an element
  // here unmounts `<NativeTabs>` entirely, and remounting it throws the user
  // back to the first tab having lost every screen's scroll position, search
  // text, filter selections and open sheets. A backgrounded app returning on a
  // flaky connection hit that every time. With cached data the screens keep
  // rendering it and each surfaces its own error, the same reasoning the
  // comment below applies to the first load.
  if (bootstrapQuery.isError && !bootstrapQuery.data) {
    return {
      kind: "blocked",
      element: (
        <NetworkConnectionRecoveryScreen
          onRetry={() => bootstrapQuery.refetch().then(() => undefined)}
          isRetrying={bootstrapQuery.isFetching}
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

  // Bootstrap's first load no longer blocks the tab tree — each destination
  // screen already runs its own `useBootstrap` and shows its own skeleton
  // (AdminHomeScreen/DashboardSkeleton, ScheduleScreen/ScheduleSkeleton,
  // etc.), so it's safe to let the router mount early. Tab visibility can't
  // read real permissions yet, so every tab shows optimistically rather than
  // guessing from empty data; a tab that turns out not to apply (e.g. Home
  // for a management-only user) disappears once this settles, in exchange
  // for never having tabs pop IN after the fact.
  return {
    kind: "ready",
    canViewTeamSchedule: bootstrapQuery.isLoading
      ? true
      : (bootstrapQuery.data?.permissions.canViewSchedule ?? false),
    canViewRequestsTab: bootstrapQuery.isLoading
      ? true
      : isOnSchedule(focusAreaIds) ||
        Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests),
    canViewHomeTab: bootstrapQuery.isLoading ? true : !isManagementOnlyUser,
  };
}
