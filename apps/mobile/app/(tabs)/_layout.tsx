import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
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

/** The narrowest regular-width screen, an iPad mini held tall. */
const WIDE_MIN_WIDTH = 744;

export default function TabsLayout() {
  const gate = useTabsGate();
  const mobileColors = useMobileColors();
  const { resolvedTheme } = useThemeMode();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const [, setEntranceEnded] = useState(false);
  const { width } = useWindowDimensions();
  const wideRef = useRef(false);
  wideRef.current = width >= WIDE_MIN_WIDTH;
  const tabBarNudgedRef = useRef(false);
  const [tabBarHidden, setTabBarHidden] = useState(false);

  // Created while this screen slides in after a sign-in, the iOS tab bar lays
  // its labels out truncated ("Sc…") and keeps them. One render after the
  // entrance hands it `labelStyle` afresh, which lays them out again; bootstrap
  // arriving late used to supply that render, and after sign-in it is warm.
  //
  // On a regular-width screen (iPhone Duo open or partly folded) it is worse:
  // created during the entrance, the floating tab bar isn't drawn at all until
  // it is hidden and shown again, or a size-class change (folding and
  // unfolding) redraws it. So a wide entrance hides it once and shows it on
  // the next frame.
  useEffect(
    () =>
      navigation.addListener("transitionEnd", (event) => {
        if (event.data.closing) return;
        setEntranceEnded(true);
        if (wideRef.current && !tabBarNudgedRef.current) {
          tabBarNudgedRef.current = true;
          setTabBarHidden(true);
        }
      }),
    [navigation],
  );
  useEffect(() => {
    if (!tabBarHidden) return;
    const frame = requestAnimationFrame(() => setTabBarHidden(false));
    return () => cancelAnimationFrame(frame);
  }, [tabBarHidden]);

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
        hidden={tabBarHidden}
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
