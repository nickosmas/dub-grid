import { Tabs } from "expo-router";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { visibleAppTabs } from "../../src/shared/navigation/app-tabs";
import { useMobileColors } from "../../src/shared/providers/ThemeModeProvider";
import { mobileText, mobileTypography } from "../../src/shared/theme/tokens";

/**
 * Web build of the tab bar. The gating rules (auth, org-locked, per-role tab
 * visibility) deliberately come from the shared `useTabsGate` rather than being
 * re-derived here — a second copy silently drifted from the native one before.
 * The push hooks it mounts are no-ops on web.
 */
export { TabsErrorBoundary as ErrorBoundary } from "../../src/shared/components/TabsErrorBoundary";

export default function TabsLayoutWeb() {
  const gate = useTabsGate();
  const mobileColors = useMobileColors();

  if (gate.kind === "blocked") {
    return gate.element;
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
          fontFamily: mobileTypography.fontFamily.bold,
          fontSize: mobileText.label.fontSize,
        },
      }}
    >
      {visibleAppTabs(gate).map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
