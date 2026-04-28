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
import { usePushRegistration } from "../../src/features/notifications/hooks/usePushRegistration";
import { useSessionState } from "../../src/shared/providers/AuthSessionProvider";
import { mobileColors } from "../../src/shared/theme/tokens";

export default function TabsLayout() {
  const { accessToken, isLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  usePushRegistration(accessToken, bootstrapQuery.data?.currentOrg.id);
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.effectiveRole !== "user" ||
      bootstrapQuery.data.permissions.canApproveShiftRequests ||
      bootstrapQuery.data.permissions.canManageEmployees
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
      <NativeTabs.Trigger name="me">
        <Label>Me</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="person-outline" />,
            selected: <VectorIcon family={Ionicons} name="person" />,
          }}
          sf={{ default: "person", selected: "person.fill" }}
        />
      </NativeTabs.Trigger>
      {canViewTeamSchedule ? (
        <NativeTabs.Trigger name="team">
          <Label>Schedule</Label>
          <Icon
            androidSrc={{
              default: <VectorIcon family={Ionicons} name="calendar-outline" />,
              selected: <VectorIcon family={Ionicons} name="calendar" />,
            }}
            sf={{ default: "calendar", selected: "calendar" }}
          />
        </NativeTabs.Trigger>
      ) : null}
      <NativeTabs.Trigger name="requests">
        <Label>Requests</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="swap-horizontal-outline" />,
            selected: <VectorIcon family={Ionicons} name="swap-horizontal" />,
          }}
          sf={{ default: "arrow.left.arrow.right", selected: "arrow.left.arrow.right.circle.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="people">
        <Label>People</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="people-outline" />,
            selected: <VectorIcon family={Ionicons} name="people" />,
          }}
          sf={{ default: "person.2", selected: "person.2.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Label>Profile</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="person-circle-outline" />,
            selected: <VectorIcon family={Ionicons} name="person-circle" />,
          }}
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
