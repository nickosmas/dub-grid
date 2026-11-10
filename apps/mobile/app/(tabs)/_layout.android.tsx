import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTabsGate } from "../../src/features/auth/hooks/useTabsGate";
import { visibleAppTabs } from "../../src/shared/navigation/app-tabs";
import { useMobileColors } from "../../src/shared/providers/ThemeModeProvider";
import { mobileText, mobileTypography } from "../../src/shared/theme/tokens";

export { TabsErrorBoundary as ErrorBoundary } from "../../src/shared/components/TabsErrorBoundary";

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

  return (
    <NativeTabs
      backgroundColor={mobileColors.surface}
      badgeBackgroundColor={mobileColors.danger}
      iconColor={{ default: mobileColors.textSubtle, selected: mobileColors.brand }}
      indicatorColor={mobileColors.brandSoft}
      // Material 3's label: 12sp medium, the same weight selected or not.
      labelStyle={{
        default: {
          color: mobileColors.textSubtle,
          fontFamily: mobileTypography.fontFamily.medium,
          fontSize: mobileText.caption.fontSize,
        },
        selected: {
          color: mobileColors.brand,
          fontFamily: mobileTypography.fontFamily.medium,
          fontSize: mobileText.caption.fontSize,
        },
      }}
      labelVisibilityMode="labeled"
      rippleColor={mobileColors.rippleNeutral}
    >
      {visibleAppTabs(gate).map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <Label>{tab.label}</Label>
          <Icon md={tab.material} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
