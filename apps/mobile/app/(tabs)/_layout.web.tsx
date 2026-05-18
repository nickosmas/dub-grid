import { Redirect, Tabs } from "expo-router";
import { LoadingScreen } from "../../src/shared/components/LoadingScreen";
import { useBootstrap } from "../../src/features/auth/hooks/useBootstrap";
import { WorkspaceLockedScreen } from "../../src/features/auth/screens/WorkspaceLockedScreen";
import { handleExpiredMobileSession } from "../../src/shared/lib/auth-reset";
import { getWorkspaceUnavailableMessage } from "../../src/shared/lib/errors";
import { useSessionState } from "../../src/shared/providers/AuthSessionProvider";
import { mobileColors } from "../../src/shared/theme/tokens";

export default function TabsLayoutWeb() {
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const lockedMessage = getWorkspaceUnavailableMessage(bootstrapQuery.error);
  const canViewTeamSchedule = bootstrapQuery.data && !lockedMessage
    ? bootstrapQuery.data.permissions.canViewSchedule
    : false;

  if (isLoading) {
    return (
      <LoadingScreen
        title="Loading your workspace"
        body="Getting your schedule and mobile tools ready."
      />
    );
  }

  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  if (lockedMessage) {
    return (
      <WorkspaceLockedScreen
        isRetrying={bootstrapQuery.isFetching}
        message={lockedMessage}
        onRetry={() => {
          void bootstrapQuery.refetch();
        }}
        onSignOut={() => {
          void handleExpiredMobileSession();
        }}
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mobileColors.brand,
        tabBarInactiveTintColor: mobileColors.textSubtle,
        tabBarStyle: {
          backgroundColor: mobileColors.surface,
          borderTopColor: mobileColors.borderSubtle,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      {canViewTeamSchedule ? (
        <Tabs.Screen name="team" options={{ title: "Schedule" }} />
      ) : null}
      <Tabs.Screen name="requests" options={{ title: "Requests" }} />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
