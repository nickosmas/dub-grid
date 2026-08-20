import { Tabs } from "expo-router";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { FloatingTabBar } from "../../src/shared/components/FloatingTabBar";

export default function TabsLayoutAndroid() {
  const gate = useTabsGate();

  if (gate.kind === "blocked") {
    return gate.element;
  }

  const { canViewTeamSchedule, canViewRequestsTab, canViewHomeTab } = gate;

  return (
    <Tabs
      // No `tabBarStyle`: a custom `tabBar` replaces react-navigation's own bar
      // outright, so those styles were never rendered. `FloatingTabBar` owns its
      // fill, and floats by positioning itself over the screen container.
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          href: canViewHomeTab ? "/home" : null,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "Schedule",
          href: canViewTeamSchedule ? "/team" : null,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Requests",
          href: canViewRequestsTab ? "/requests" : null,
        }}
      />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
