import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  mobileColors,
  mobileRadii,
} from "../../../../shared/theme/tokens";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const NOTES: Array<{
  iconName: IoniconName;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  meta: string;
  unread?: boolean;
}> = [
  {
    iconName: "checkmark-circle",
    iconBg: "#DCFCE7",
    iconColor: "#15803D",
    title: "Swap approved",
    body: "Laura Marshall accepted your shift trade for Fri, May 15.",
    meta: "2m",
    unread: true,
  },
  {
    iconName: "calendar",
    iconBg: "#DBEAFE",
    iconColor: "#1D4ED8",
    title: "Schedule published",
    body: "Your week of May 17 is live.",
    meta: "1h",
  },
  {
    iconName: "alert-circle",
    iconBg: "#FEF3C7",
    iconColor: "#B45309",
    title: "Open shift available",
    body: "Day shift, Skilled Nursing. Sun, May 17.",
    meta: "3h",
  },
];

export function IllustrationNotifications() {
  return (
    <View accessible={false} style={styles.stack}>
      <View style={styles.headerChip}>
        <Ionicons
          color={mobileColors.brand}
          name="notifications"
          size={14}
        />
        <Text style={styles.headerLabel}>Alerts</Text>
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>3</Text>
        </View>
      </View>

      {NOTES.map((note, index) => (
        <View
          key={note.title}
          style={[
            styles.card,
            index === 0 ? styles.cardLead : null,
          ]}
        >
          <View
            style={[styles.iconCircle, { backgroundColor: note.iconBg }]}
          >
            <Ionicons color={note.iconColor} name={note.iconName} size={16} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.title}>
                {note.title}
              </Text>
              <Text style={styles.meta}>{note.meta}</Text>
            </View>
            <Text numberOfLines={1} style={styles.body}>
              {note.body}
            </Text>
          </View>
          {note.unread ? <View style={styles.unreadDot} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: 296,
    gap: 8,
  },
  headerChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    marginBottom: 2,
  },
  headerLabel: {
    color: mobileColors.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  unreadBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: mobileColors.brand,
    minWidth: 16,
    alignItems: "center",
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardLead: {
    borderColor: mobileColors.brandBorder,
    backgroundColor: "#F8FBFF",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  meta: {
    color: mobileColors.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  body: {
    color: mobileColors.textMuted,
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: mobileColors.brand,
  },
});
