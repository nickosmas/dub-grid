import type { ReactNode } from "react";
import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../../shared/components/Text";
import { useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../../shared/theme/tokens";

/**
 * Shared pieces for the onboarding mock-ups.
 *
 * Each illustration is a still of a real screen — the Home tab's shift hero
 * (`schedule/screens/ScheduleScreen.tsx`), the Requests "Available" tab
 * (`shift-requests/screens/RequestsScreen.tsx`) and the Alerts list
 * (`notifications/screens/NotificationsScreen.tsx`) — rebuilt from the same
 * theme tokens those screens use, so what a new user is shown is what they get
 * on their first launch. Values that look like magic numbers here are the real
 * screen's values; the referenced file is the source of truth for each.
 *
 * Two rules hold for all of them:
 *
 * - **Nothing is pressable.** They sit inside the onboarding pager, so a
 *   Pressable would compete with the horizontal swipe and offer a tap that goes
 *   nowhere. Controls are drawn, not mounted.
 * - **Nothing is announced.** They are decorative; the slide's own title and
 *   body carry the meaning, so the frame hides the whole subtree from
 *   assistive tech.
 */

/**
 * How far each mock-up bleeds past the slide's own padding.
 *
 * The onboarding slide pads to `mobileSpace["2xl"]` so its copy reads at a
 * comfortable measure, but an app screen pads to `mobileSpacing.screenX`.
 * Giving back the difference puts every mock-up at the exact width its screen
 * has on the same device — a card that fills the phone edge to edge has to
 * look like it fills the phone, not like a postcard floating inside the slide.
 */
const SCREEN_BLEED = mobileSpace["2xl"] - mobileSpacing.screenX;

export function IllustrationFrame({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.frame, { gap }]}
    >
      {children}
    </View>
  );
}

export type MockButtonTone = "primary" | "secondary" | "neutral";

/**
 * A drawn stand-in for `<Button size="sm">`. Geometry and fills come from
 * `shared/components/Button.tsx`'s `sm` metrics and tone map.
 */
export function MockButton({
  label,
  tone = "primary",
  icon,
}: {
  label: string;
  tone?: MockButtonTone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const fill = {
    primary: mobileColors.brand,
    secondary: mobileColors.controlSecondaryBg,
    neutral: mobileColors.controlNeutralBg,
  }[tone];
  const labelColor = {
    primary: mobileColors.onBrandText,
    secondary: mobileColors.controlSecondaryFg,
    neutral: mobileColors.textSecondary,
  }[tone];

  return (
    <View style={[styles.button, { backgroundColor: fill }]}>
      <Text style={[styles.buttonLabel, { color: labelColor }]}>{label}</Text>
      {icon ? <Ionicons color={labelColor} name={icon} size={16} /> : null}
    </View>
  );
}

/** A drawn stand-in for `<Button tone="ghost" iconOnly size="sm">`. */
export function MockIconButton({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.iconButton}>
      <Ionicons color={mobileColors.textMuted} name={icon} size={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    // Stretch rather than a width, so the negative margins widen the box
    // instead of shifting a fixed-width one off centre.
    alignSelf: "stretch",
    marginHorizontal: -SCREEN_BLEED,
    paddingVertical: 12,
  },
});

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    button: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: mobileSpace.md,
      borderRadius: mobileRadii.pill,
    },
    buttonLabel: {
      ...mobileText.bodyStrong,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: mobileRadii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
  });
