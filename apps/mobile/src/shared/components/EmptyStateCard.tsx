import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { mobileColors, mobileText } from "../theme/tokens";

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
    paddingHorizontal: 4,
    paddingVertical: 18,
    gap: 14,
    alignItems: "center",
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
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
    textAlign: "center",
  },
  body: {
    ...mobileText.body,
    color: mobileColors.textMuted,
    textAlign: "center",
  },
  actionRow: {
    alignItems: "center",
  },
});
