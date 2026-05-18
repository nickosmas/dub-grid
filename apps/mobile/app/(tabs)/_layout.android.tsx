import { Tabs } from "expo-router";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { FloatingTabBar } from "../../src/shared/components/FloatingTabBar";

export default function TabsLayoutAndroid() {
  const gate = useTabsGate();

  if (gate.kind === "blocked") {
    return gate.element;
  }

  const { canViewTeamSchedule } = gate;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen
        name="team"
        options={{
          title: "Schedule",
          href: canViewTeamSchedule ? "/team" : null,
        }}
      />
      <Tabs.Screen name="requests" options={{ title: "Requests" }} />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
