import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { NOTIFICATION_CATEGORIES } from "../../notifications/lib/notification-categories";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

// The tour pads to `mobileSpace["2xl"]`; giving back the difference to the
// app's own gutter puts this card at the width the other slides' mock-ups
// have, so the slide keeps their silhouette.
const SCREEN_BLEED = mobileSpace["2xl"] - mobileSpacing.screenX;

/**
 * The reasons card on the notification step of the tour: one row per
 * category Profile > Notifications controls, in that screen's order. Real, readable
 * content rather than a mock-up: it is what the person is agreeing to, so it
 * scales with their text setting and is read out by assistive tech.
 */
export function NotificationReasons() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.card}>
      {NOTIFICATION_CATEGORIES.map((reason) => (
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
