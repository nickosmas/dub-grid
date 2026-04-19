import { Redirect, Tabs } from "expo-router";
import { LoadingScreen } from "../../src/shared/components/LoadingScreen";
import { useBootstrap } from "../../src/features/auth/hooks/useBootstrap";
import { useSessionState } from "../../src/shared/providers/AuthSessionProvider";
import { mobileColors } from "../../src/shared/theme/tokens";

export default function TabsLayoutWeb() {
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.effectiveRole !== "user" ||
      bootstrapQuery.data.permissions.canApproveShiftRequests ||
      bootstrapQuery.data.permissions.canManageEmployees
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
      <Tabs.Screen name="me" options={{ title: "Me" }} />
      {canViewTeamSchedule ? (
        <Tabs.Screen name="team" options={{ title: "Schedule" }} />
      ) : null}
      <Tabs.Screen name="requests" options={{ title: "Requests" }} />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
