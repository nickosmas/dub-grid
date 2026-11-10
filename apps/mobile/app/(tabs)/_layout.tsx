import { useEffect, useState } from "react";
import type { ParamListBase } from "expo-router/react-navigation";
import type { NativeStackNavigationProp } from "expo-router/native-stack";
import { useNavigation } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

const { Icon, Label } = NativeTabs.Trigger;
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { visibleAppTabs } from "../../src/shared/navigation/app-tabs";
import { NativeTabBarPresenceProvider } from "../../src/shared/navigation/NativeTabBarPresence";
import { useMobileColors, useThemeMode } from "../../src/shared/providers/ThemeModeProvider";
import { mobileText, mobileTypography } from "../../src/shared/theme/tokens";

export { TabsErrorBoundary as ErrorBoundary } from "../../src/shared/components/TabsErrorBoundary";

export default function TabsLayout() {
  const gate = useTabsGate();
  const mobileColors = useMobileColors();
  const { resolvedTheme } = useThemeMode();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const [, setEntranceEnded] = useState(false);

  // Created while this screen slides in after a sign-in, the iOS tab bar lays
  // its labels out truncated ("Sc…") and keeps them. One render after the
  // entrance hands it `labelStyle` afresh, which lays them out again; bootstrap
  // arriving late used to supply that render, and after sign-in it is warm.
  useEffect(
    () =>
      navigation.addListener("transitionEnd", (event) => {
        if (!event.data.closing) setEntranceEnded(true);
      }),
    [navigation],
  );

  if (gate.kind === "blocked") {
    return gate.element;
  }

  const tabTriggers = visibleAppTabs(gate).map((tab) => (
    <NativeTabs.Trigger key={tab.name} name={tab.name}>
      <Label>{tab.label}</Label>
      <Icon sf={tab.sf} />
    </NativeTabs.Trigger>
  ));

  return (
    <NativeTabBarPresenceProvider>
      <NativeTabs
        backgroundColor={mobileColors.surface}
        badgeBackgroundColor={mobileColors.danger}
        blurEffect={
          resolvedTheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"
        }
        disableTransparentOnScrollEdge
        iconColor={{
          default: mobileColors.textSubtle,
          selected: mobileColors.brand,
        }}
        labelStyle={{
          default: {
            color: mobileColors.textSubtle,
            fontFamily: mobileTypography.fontFamily.semibold,
            fontSize: mobileText.badge.fontSize,
          },
          // UIKit keeps the weight when a tab is selected; only the colour changes.
          selected: {
            color: mobileColors.brand,
            fontFamily: mobileTypography.fontFamily.semibold,
            fontSize: mobileText.badge.fontSize,
          },
        }}
        minimizeBehavior="never"
        shadowColor={mobileColors.shadow}
        tintColor={mobileColors.brand}
      >
        {tabTriggers}
      </NativeTabs>
    </NativeTabBarPresenceProvider>
  );
}
