import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * What the notification permission is for, one row per category the switches
 * in Profile > Notifications control, with that screen's glyphs. Every kind
 * named here is one the app actually sends; there is no open-shift alert, so
 * none is promised.
 */
export const NOTIFICATION_REASONS = [
  {
    icon: "calendar-outline",
    title: "Schedule updates",
    detail: "A schedule is published, or one of your shifts is added, moved, or removed.",
  },
  {
    icon: "swap-horizontal-outline",
    title: "Shift requests",
    detail: "Your pickup, swap, or time-off request is answered, or a new one needs your approval.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Account and sign-in",
    detail: "Your role or access changes, or a new device signs in to your account.",
  },
] as const satisfies ReadonlyArray<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
}>;

// The tour pads to `mobileSpace["2xl"]`; giving back the difference to the
// app's own gutter puts this card at the width the other slides' mock-ups
// have, so the slide keeps their silhouette.
const SCREEN_BLEED = mobileSpace["2xl"] - mobileSpacing.screenX;

/**
 * The reasons card on the notification step of the tour. Real, readable
 * content rather than a mock-up: it is what the person is agreeing to, so it
 * scales with their text setting and is read out by assistive tech.
 */
export function NotificationReasons() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.card}>
      {NOTIFICATION_REASONS.map((reason) => (
        <View key={reason.title} style={styles.row}>
          <View style={styles.iconFrame}>
            <Ionicons color={mobileColors.brand} name={reason.icon} size={18} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{reason.title}</Text>
            <Text style={styles.detail}>{reason.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      alignSelf: "stretch",
      marginHorizontal: -SCREEN_BLEED,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: mobileSpace.lg,
      gap: mobileSpace.lg,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.md,
    },
    iconFrame: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brandSoft,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
    },
    title: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    detail: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
  });
