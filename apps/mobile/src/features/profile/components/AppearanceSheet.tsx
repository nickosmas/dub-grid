import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { AppText } from "../../../shared/components/AppText";
import { BottomSheetModal } from "../../../shared/components/BottomSheetModal";
import { usePressAnimation } from "../../../shared/motion/usePressAnimation";
import { useMobileColors, useThemeMode } from "../../../shared/providers/ThemeModeProvider";
import type { ThemePreference } from "../../../shared/lib/theme-preference";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IconName = ComponentProps<typeof Ionicons>["name"];

type AppearanceOptionSpec = {
  id: ThemePreference;
  label: string;
  icon: IconName;
};

/**
 * Light and dark first, System last: the two literal choices come before the
 * one that defers to them.
 */
const APPEARANCE_OPTIONS: AppearanceOptionSpec[] = [
  // Outline, not the filled glyphs the settings rows use: at 30px a solid
  // shape is a heavy blob, and these three sit next to each other where the
  // outline's detail is what tells them apart at a glance.
  { id: "light", label: "Light", icon: "sunny-outline" },
  { id: "dark", label: "Dark", icon: "moon-outline" },
  // The device itself, which is exactly what "System" follows.
  { id: "system", label: "System", icon: "phone-portrait-outline" },
];

const APPEARANCE_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** The trailing value for the Appearance row that opens this sheet. */
export function getThemePreferenceLabel(preference: ThemePreference): string {
  return APPEARANCE_LABELS[preference];
}

/**
 * Theme picker, as a bottom sheet rather than its own pushed screen.
 *
 * Three choices is a decision the user makes in one tap and one look, which a
 * full navigation push (with its own header, back button and transition)
 * buries. Choosing dismisses immediately, so the re-themed app behind the sheet
 * is the confirmation.
 */
export function AppearanceSheet({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const { preference, setPreference } = useThemeMode();

  return (
    <BottomSheetModal
      // The title sits in the sheet's drag region so the whole header drags.
      header={<AppText variant="sectionTitle">Display mode</AppText>}
      onDismiss={onDismiss}
      visible={visible}
    >
      <View style={sheetStyles.options}>
        {APPEARANCE_OPTIONS.map((option) => (
          <AppearanceOption
            key={option.id}
            icon={option.icon}
            label={option.label}
            selected={preference === option.id}
            onPress={() => {
              setPreference(option.id);
              onDismiss();
            }}
          />
        ))}
      </View>
    </BottomSheetModal>
  );
}

function AppearanceOption({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createOptionStyles(mobileColors), [mobileColors]);
  const { animatedStyle, androidRipple, pressHandlers } = usePressAnimation();

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={androidRipple}
      onPress={onPress}
      {...pressHandlers}
      style={[styles.option, selected && styles.optionSelected, animatedStyle]}
    >
      {/* Full-strength ink, like the row icons: the border is what says which
          tile is on, so the glyph itself never has to change colour. */}
      <Ionicons color={mobileColors.textPrimary} name={icon} size={30} />
      <AppText align="center" variant="bodyStrong">
        {label}
      </AppText>
    </AnimatedPressable>
  );
}

const sheetStyles = StyleSheet.create({
  options: {
    flexDirection: "row",
    gap: mobileSpace.md,
  },
});

const createOptionStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    option: {
      flex: 1,
      alignItems: "center",
      gap: mobileSpace.md,
      paddingVertical: mobileSpace.xl,
      paddingHorizontal: mobileSpace.sm,
      borderRadius: mobileRadii.card,
      backgroundColor: mobileColors.controlNeutralBg,
      // Always drawn, transparent when unselected, so selecting a tile can't
      // reflow the row.
      borderWidth: 2,
      borderColor: "transparent",
      // Keeps the Android ripple inside the rounded corners.
      overflow: "hidden",
    },
    optionSelected: {
      backgroundColor: mobileColors.controlSecondaryBg,
      borderColor: mobileColors.brand,
    },
  });
