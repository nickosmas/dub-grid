import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { useMobileColors } from "../../src/shared/providers/ThemeModeProvider";
import { mobileText, mobileTypography } from "../../src/shared/theme/tokens";

const { Icon, Label } = NativeTabs.Trigger;

/**
 * Material 3's bottom navigation bar, drawn by Android itself, in DubGrid's
 * brand colors: the active tab's pill indicator, Material icons and labels.
 */
export default function TabsLayoutAndroid() {
  const gate = useTabsGate();
  const mobileColors = useMobileColors();

  if (gate.kind === "blocked") {
    return gate.element;
  }

  const { canViewTeamSchedule, canViewRequestsTab, canViewHomeTab } = gate;

  return (
    <NativeTabs
      backgroundColor={mobileColors.surface}
      badgeBackgroundColor={mobileColors.danger}
      iconColor={{ default: mobileColors.textSubtle, selected: mobileColors.brand }}
      indicatorColor={mobileColors.brandSoft}
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
      labelVisibilityMode="labeled"
      rippleColor={mobileColors.rippleNeutral}
    >
      {canViewHomeTab ? (
        <NativeTabs.Trigger name="home">
          <Label>Home</Label>
          <Icon md="home" />
        </NativeTabs.Trigger>
      ) : null}
      {canViewTeamSchedule ? (
        <NativeTabs.Trigger name="team">
          <Label>Schedule</Label>
          <Icon md="calendar_month" />
        </NativeTabs.Trigger>
      ) : null}
      {canViewRequestsTab ? (
        <NativeTabs.Trigger name="requests">
          <Label>Requests</Label>
          <Icon md="swap_horiz" />
        </NativeTabs.Trigger>
      ) : null}
      <NativeTabs.Trigger name="people">
        <Label>People</Label>
        <Icon md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Label>Profile</Label>
        <Icon md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
