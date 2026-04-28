import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { mobileColors, mobileRadii } from "../theme/tokens";

export function EmptyStateCard({
  iconName = "sparkles-outline",
  title,
  body,
  actionLabel,
  onAction,
}: {
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconFrame}>
        <Ionicons color={mobileColors.brand} name={iconName} size={24} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {actionLabel && onAction ? (
        <View style={styles.actionRow}>
          <Button compact label={actionLabel} onPress={onAction} tone="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 14,
    alignItems: "center",
    shadowColor: mobileColors.shadowStrong,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 2,
  },
  iconFrame: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    gap: 6,
    alignItems: "center",
  },
  title: {
    color: mobileColors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  actionRow: {
    alignItems: "center",
  },
});
