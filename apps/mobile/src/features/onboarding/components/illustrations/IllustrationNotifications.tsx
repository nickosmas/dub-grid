import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../../../../shared/theme/tokens";
import { IllustrationFrame, MockButton, MockIconButton } from "./illustration-primitives";

/**
 * The Alerts list, mirroring `NotificationCard` in
 * `notifications/screens/NotificationsScreen.tsx`: one unread card carrying its
 * action, one already-read card sitting on the muted fill. Icons follow that
 * screen's `getNotificationIconName` mapping.
 */
export function IllustrationNotifications() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <IllustrationFrame>
      <View style={styles.card}>
        <View style={styles.alertHeader}>
          <View style={styles.alertTitleRow}>
            <View style={styles.iconFrame}>
              <Ionicons color={mobileColors.brand} name="swap-horizontal" size={18} />
            </View>
            <View style={styles.titleColumn}>
              <Text style={styles.title}>Swap approved</Text>
              <Text style={styles.message}>Laura Marshall took your Friday day shift.</Text>
              <Text style={styles.meta}>2m ago</Text>
            </View>
          </View>
          <View style={styles.unreadDot} />
        </View>
        <View style={styles.cardActions}>
          <MockButton icon="arrow-forward" label="View request" tone="secondary" />
          <MockIconButton icon="archive" />
        </View>
      </View>

      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.alertHeader}>
          <View style={styles.alertTitleRow}>
            <View style={[styles.iconFrame, styles.iconFrameMuted]}>
              <Ionicons color={mobileColors.textMuted} name="calendar" size={18} />
            </View>
            <View style={styles.titleColumn}>
              <Text style={[styles.title, styles.titleMuted]}>Schedule published</Text>
              <Text style={styles.message}>Your week of May 17 is live.</Text>
              <Text style={styles.meta}>1h ago</Text>
            </View>
          </View>
        </View>
        {/* An alert with no action of its own still carries the archive
            control, so the row keeps the same shape with an empty leading
            slot. */}
        <View style={styles.cardActions}>
          <View />
          <MockIconButton icon="archive" />
        </View>
      </View>
    </IllustrationFrame>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
    },
    cardMuted: {
      backgroundColor: mobileColors.surfaceSecondary,
    },
    alertHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    alertTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      flex: 1,
    },
    iconFrame: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brandSoft,
    },
    iconFrameMuted: {
      backgroundColor: mobileColors.surface,
    },
    titleColumn: {
      flex: 1,
      gap: 4,
    },
    title: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
    },
    titleMuted: {
      color: mobileColors.textSecondary,
    },
    message: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    meta: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    unreadDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: mobileColors.brand,
    },
    cardActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginLeft: 42,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
  });
