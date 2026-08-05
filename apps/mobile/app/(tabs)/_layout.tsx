import Ionicons from "@expo/vector-icons/Ionicons";
import type { ErrorBoundaryProps } from "expo-router";
import { Icon, Label, NativeTabs, VectorIcon } from "expo-router/unstable-native-tabs";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { RouteErrorScreen } from "../../src/shared/components/RouteErrorScreen";
import { useMobileColors, useThemeMode } from "../../src/shared/providers/ThemeModeProvider";

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
          fontSize: 11,
          fontWeight: "600",
        },
        selected: {
          color: mobileColors.brand,
          fontSize: 11,
          fontWeight: "700",
        },
      }}
      minimizeBehavior="never"
      shadowColor={mobileColors.shadow}
      tintColor={mobileColors.brand}
    >
      {tabTriggers}
    </NativeTabs>
  );
}
