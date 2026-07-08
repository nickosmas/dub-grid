import { useEffect, type ReactNode } from "react";
import { Redirect } from "expo-router";
import { AppState } from "react-native";
import { LoadingScreen } from "../../../shared/components/LoadingScreen";
import { useBootstrap } from "./useBootstrap";
import { OrganizationLockedScreen } from "../screens/OrganizationLockedScreen";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";
import { usePushResponseHandler } from "../../notifications/hooks/usePushResponseHandler";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { getOrgUnavailableMessage } from "../../../shared/lib/errors";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";

export type TabsGateResult =
  { kind: "blocked"; element: ReactNode } | { kind: "ready"; canViewTeamSchedule: boolean };

export function useTabsGate(): TabsGateResult {
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const lockedMessage = getOrgUnavailableMessage(bootstrapQuery.error);
  usePushRegistration(accessToken, lockedMessage ? null : bootstrapQuery.data?.currentOrg.id);
  usePushResponseHandler(Boolean(accessToken));

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void bootstrapQuery.refetch();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken, bootstrapQuery]);

  if (isLoading) {
    return {
      kind: "blocked",
      element: (
        <LoadingScreen
          title="Loading your organization"
          body="Getting your schedule and mobile tools ready."
        />
      ),
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

  return {
    kind: "ready",
    canViewTeamSchedule: bootstrapQuery.data?.permissions.canViewSchedule ?? false,
  };
}
