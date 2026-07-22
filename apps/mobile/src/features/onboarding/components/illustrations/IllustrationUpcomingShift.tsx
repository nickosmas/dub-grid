import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import { mobileRadii, type MobileColors } from "../../../../shared/theme/tokens";

const AVATARS = [
  { bg: "#DBEAFE", fg: "#1D4ED8", initials: "BT" },
  { bg: "#FEF3C7", fg: "#92400E", initials: "RC" },
  { bg: "#FCE7F3", fg: "#9D174D", initials: "RB" },
];

export function IllustrationUpcomingShift() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View accessible={false} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.pill}>
          <View style={styles.pillDot} />
          <Text style={styles.pillLabel}>UPCOMING</Text>
        </View>
        <View style={styles.dateChip}>
          <Text style={styles.dateChipDay}>FRI</Text>
          <Text style={styles.dateChipNum}>15</Text>
        </View>
      </View>

      <Text style={styles.shiftTitle}>Day Shift</Text>

      <View style={styles.metaRow}>
        <Ionicons color="#FFFFFF" name="location-outline" size={14} />
        <Text style={styles.metaLabel}>Skilled Nursing</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons color="#FFFFFF" name="time-outline" size={14} />
        <Text style={styles.metaLabel}>7:00 AM – 3:30 PM</Text>
      </View>

      <View style={styles.workingWith}>
        <View style={styles.workingWithLeft}>
          <Ionicons color="#FFFFFF" name="people-outline" size={14} />
          <Text style={styles.workingWithLabel}>Working with</Text>
        </View>
        <View style={styles.avatars}>
          {AVATARS.map((avatar, index) => (
            <View
              key={avatar.initials}
              style={[
                styles.avatar,
                {
                  backgroundColor: avatar.bg,
                  marginLeft: index === 0 ? 0 : -6,
                },
              ]}
            >
              <Text style={[styles.avatarText, { color: avatar.fg }]}>{avatar.initials}</Text>
            </View>
          ))}
          <View style={[styles.avatar, styles.avatarMore]}>
            <Text style={styles.avatarMoreText}>+2</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
  card: {
    width: 296,
    backgroundColor: mobileColors.brand,
    borderRadius: mobileRadii.card,
    padding: 18,
    gap: 8,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#BFDBFE",
  },
  pillLabel: {
    color: "#DBEAFE",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  dateChip: {
    width: 44,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
  },
  dateChipDay: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  dateChipNum: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  shiftTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginTop: 6,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    color: "#E0EAFE",
    fontSize: 13,
    fontWeight: "600",
  },
  workingWith: {
    marginTop: 10,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
  },
  workingWithLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workingWithLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  avatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: mobileColors.brand,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "700",
  },
  avatarMore: {
    backgroundColor: "#BFDBFE",
    marginLeft: -6,
  },
  avatarMoreText: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "700",
  },
});
