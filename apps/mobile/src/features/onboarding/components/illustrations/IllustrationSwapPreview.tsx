import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import { mobileRadii, type MobileColors } from "../../../../shared/theme/tokens";

export function IllustrationSwapPreview() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View accessible={false} style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.label}>YOU GIVE</Text>
        <Text style={styles.shiftName}>Day Shift</Text>
        <Text style={styles.shiftMeta}>Fri, May 15 · 7:00 AM – 3:30 PM</Text>
        <Text style={styles.shiftSub}>Skilled Nursing</Text>
      </View>

      <View style={styles.arrowChip}>
        <Ionicons color={mobileColors.brand} name="swap-vertical" size={18} />
      </View>

      <View style={[styles.card, styles.cardReceive]}>
        <Text style={styles.label}>YOU GET</Text>
        <View style={styles.titleRow}>
          <Text style={styles.shiftName}>Evening Shift</Text>
          <View style={styles.supervisorPill}>
            <Text style={styles.supervisorText}>SUPERVISOR</Text>
          </View>
        </View>
        <Text style={styles.shiftMeta}>Fri, May 15 · 3:30 PM – 12:00 AM</Text>
        <Text style={styles.shiftSub}>From Laura Marshall</Text>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    stack: {
      width: 296,
      alignItems: "stretch",
      gap: 8,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 2,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      shadowColor: mobileColors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    cardReceive: {
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    label: {
      color: mobileColors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.1,
      marginBottom: 2,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    shiftName: {
      color: mobileColors.textPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    shiftMeta: {
      color: mobileColors.textSecondary,
      fontSize: 12,
      fontWeight: "500",
      marginTop: 2,
    },
    shiftSub: {
      color: mobileColors.textMuted,
      fontSize: 12,
    },
    supervisorPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: mobileColors.warningSoft,
    },
    supervisorText: {
      color: mobileColors.warningText,
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.6,
    },
    arrowChip: {
      alignSelf: "center",
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: mobileColors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      marginVertical: -16,
      zIndex: 2,
    },
  });
