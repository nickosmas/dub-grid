import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ParamListBase } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation, type ErrorBoundaryProps } from "expo-router";
import { Icon, Label, NativeTabs, VectorIcon } from "expo-router/unstable-native-tabs";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { RouteErrorScreen } from "../../src/shared/components/RouteErrorScreen";
import { NativeTabBarPresenceProvider } from "../../src/shared/navigation/NativeTabBarPresence";
import { useMobileColors, useThemeMode } from "../../src/shared/providers/ThemeModeProvider";
import { mobileText, mobileTypography } from "../../src/shared/theme/tokens";

/**
 * Keeps a crash inside the authed tab tree from unmounting the whole app —
 * the provider tree above stays alive, so "Try again" can actually recover.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <RouteErrorScreen
      actionLabel="Try again"
      body="Something went wrong loading this tab. Trying again usually clears it."
      detail={error.message}
      onAction={() => {
        void retry();
      }}
      title="This tab ran into a problem"
    />
  );
}

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

  const { canViewTeamSchedule, canViewRequestsTab, canViewHomeTab } = gate;

  const tabTriggers = [
    ...(canViewHomeTab
      ? [
          <NativeTabs.Trigger key="home" name="home">
            <Label>Home</Label>
            <Icon
              src={{
                default: <VectorIcon family={Ionicons} name="home-outline" />,
                selected: <VectorIcon family={Ionicons} name="home" />,
              }}
            />
          </NativeTabs.Trigger>,
        ]
      : []),
    ...(canViewTeamSchedule
      ? [
          <NativeTabs.Trigger key="team" name="team">
            <Label>Schedule</Label>
            <Icon
              androidSrc={{
                default: <VectorIcon family={Ionicons} name="calendar-outline" />,
                selected: <VectorIcon family={Ionicons} name="calendar" />,
              }}
              sf={{ default: "calendar", selected: "calendar" }}
            />
          </NativeTabs.Trigger>,
        ]
      : []),
    ...(canViewRequestsTab
      ? [
          <NativeTabs.Trigger key="requests" name="requests">
            <Label>Requests</Label>
            <Icon
              androidSrc={{
                default: <VectorIcon family={Ionicons} name="swap-horizontal-outline" />,
                selected: <VectorIcon family={Ionicons} name="swap-horizontal" />,
              }}
              sf={{
                default: "arrow.left.arrow.right",
                selected: "arrow.left.arrow.right.circle.fill",
              }}
            />
          </NativeTabs.Trigger>,
        ]
      : []),
    <NativeTabs.Trigger key="people" name="people">
      <Label>People</Label>
      <Icon
        androidSrc={{
          default: <VectorIcon family={Ionicons} name="people-outline" />,
          selected: <VectorIcon family={Ionicons} name="people" />,
        }}
        sf={{ default: "person.2", selected: "person.2.fill" }}
      />
    </NativeTabs.Trigger>,
    <NativeTabs.Trigger key="profile" name="profile">
      <Label>Profile</Label>
      <Icon
        androidSrc={{
          default: <VectorIcon family={Ionicons} name="person-circle-outline" />,
          selected: <VectorIcon family={Ionicons} name="person-circle" />,
        }}
        sf={{
          default: "person.crop.circle",
          selected: "person.crop.circle.fill",
        }}
      />
    </NativeTabs.Trigger>,
  ];

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
          selected: {
            color: mobileColors.brand,
            fontFamily: mobileTypography.fontFamily.bold,
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
