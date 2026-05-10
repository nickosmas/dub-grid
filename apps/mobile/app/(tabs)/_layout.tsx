import { useEffect } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";
import { AppState } from "react-native";
import { LoadingScreen } from "../../src/shared/components/LoadingScreen";
import { useBootstrap } from "../../src/features/auth/hooks/useBootstrap";
import { WorkspaceLockedScreen } from "../../src/features/auth/screens/WorkspaceLockedScreen";
import { usePushRegistration } from "../../src/features/notifications/hooks/usePushRegistration";
import { handleExpiredMobileSession } from "../../src/shared/lib/auth-reset";
import { getWorkspaceUnavailableMessage } from "../../src/shared/lib/errors";
import { useSessionState } from "../../src/shared/providers/AuthSessionProvider";
import { mobileColors } from "../../src/shared/theme/tokens";

export default function TabsLayout() {
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const lockedMessage = getWorkspaceUnavailableMessage(bootstrapQuery.error);
  usePushRegistration(
    accessToken,
    lockedMessage ? null : bootstrapQuery.data?.currentOrg.id,
  );
  const canViewTeamSchedule = bootstrapQuery.data && !lockedMessage
    ? bootstrapQuery.data.permissions.canViewSchedule
    : false;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void bootstrapQuery.refetch();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken, bootstrapQuery]);

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

  if (lockedMessage) {
    return (
      <WorkspaceLockedScreen
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

  const tabTriggers = [
    <NativeTabs.Trigger key="me" name="me">
      <Label>Me</Label>
      <Icon
        androidSrc={{
          default: <VectorIcon family={Ionicons} name="person-outline" />,
          selected: <VectorIcon family={Ionicons} name="person" />,
        }}
        sf={{ default: "person", selected: "person.fill" }}
      />
    </NativeTabs.Trigger>,
    ...(canViewTeamSchedule
      ? [
          <NativeTabs.Trigger key="team" name="team">
            <Label>Schedule</Label>
            <Icon
              androidSrc={{
                default: (
                  <VectorIcon family={Ionicons} name="calendar-outline" />
                ),
                selected: <VectorIcon family={Ionicons} name="calendar" />,
              }}
              sf={{ default: "calendar", selected: "calendar" }}
            />
          </NativeTabs.Trigger>,
        ]
      : []),
    <NativeTabs.Trigger key="requests" name="requests">
      <Label>Requests</Label>
      <Icon
        androidSrc={{
          default: (
            <VectorIcon family={Ionicons} name="swap-horizontal-outline" />
          ),
          selected: <VectorIcon family={Ionicons} name="swap-horizontal" />,
        }}
        sf={{
          default: "arrow.left.arrow.right",
          selected: "arrow.left.arrow.right.circle.fill",
        }}
      />
    </NativeTabs.Trigger>,
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
          default: (
            <VectorIcon family={Ionicons} name="person-circle-outline" />
          ),
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
      blurEffect="systemChromeMaterialLight"
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
      minimizeBehavior="onScrollDown"
      shadowColor={mobileColors.shadow}
      tintColor={mobileColors.brand}
    >
      {tabTriggers}
    </NativeTabs>
  );
}
