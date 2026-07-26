import { Redirect, Tabs } from "expo-router";
import { AppSplashScreen } from "../../src/shared/components/AppSplashScreen";
import { useBootstrap } from "../../src/features/auth/hooks/useBootstrap";
import { OrganizationLockedScreen } from "../../src/features/auth/screens/OrganizationLockedScreen";
import { handleExpiredMobileSession } from "../../src/shared/lib/auth-reset";
import { getOrgUnavailableMessage } from "../../src/shared/lib/errors";
import { useSessionState } from "../../src/shared/providers/AuthSessionProvider";
import { useMobileColors } from "../../src/shared/providers/ThemeModeProvider";
import { isManagementOnly, isOnSchedule } from "../../src/features/auth/hooks/employmentStatus";

export default function TabsLayoutWeb() {
  const mobileColors = useMobileColors();
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const lockedMessage = getOrgUnavailableMessage(bootstrapQuery.error);
  const canViewTeamSchedule =
    bootstrapQuery.data && !lockedMessage ? bootstrapQuery.data.permissions.canViewSchedule : false;
  const canViewRequestsTab =
    bootstrapQuery.data && !lockedMessage
      ? isOnSchedule(bootstrapQuery.data.linkedEmployee?.focusAreaIds ?? []) ||
        Boolean(bootstrapQuery.data.permissions.canApproveShiftRequests)
      : false;
  const canViewHomeTab =
    bootstrapQuery.data && !lockedMessage
      ? !(
          bootstrapQuery.data.effectiveRole === "user" &&
          isManagementOnly(
            bootstrapQuery.data.linkedEmployee?.focusAreaIds ?? [],
            bootstrapQuery.data.linkedEmployee?.departmentIds ?? [],
          )
        )
      : true;

  if (isLoading) {
    return <AppSplashScreen />;
  }

  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  if (lockedMessage) {
    return (
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
      {canViewHomeTab ? <Tabs.Screen name="home" options={{ title: "Home" }} /> : null}
      {canViewTeamSchedule ? <Tabs.Screen name="team" options={{ title: "Schedule" }} /> : null}
      {canViewRequestsTab ? <Tabs.Screen name="requests" options={{ title: "Requests" }} /> : null}
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
