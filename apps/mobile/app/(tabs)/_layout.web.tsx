import { Tabs } from "expo-router";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { useMobileColors } from "../../src/shared/providers/ThemeModeProvider";

/**
 * Web build of the tab bar. The gating rules (auth, org-locked, per-role tab
 * visibility) deliberately come from the shared `useTabsGate` rather than being
 * re-derived here — a second copy silently drifted from the native one before.
 * The push hooks it mounts are no-ops on web.
 */
export default function TabsLayoutWeb() {
  const gate = useTabsGate();
  const mobileColors = useMobileColors();

  if (gate.kind === "blocked") {
    return gate.element;
  }

  const { canViewTeamSchedule, canViewRequestsTab, canViewHomeTab } = gate;

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
