import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { mobileColors, mobileRadii } from "../theme/tokens";

type StatusBannerTone = "error" | "warning" | "info" | "success";

const STATUS_BANNER_TONE = {
  error: {
    backgroundColor: mobileColors.dangerSoft,
    borderColor: mobileColors.dangerBorder,
    iconColor: mobileColors.danger,
    titleColor: mobileColors.textPrimary,
    bodyColor: mobileColors.textMuted,
    iconName: "alert-circle-outline" as const,
    actionTone: "danger" as const,
  },
  warning: {
    backgroundColor: mobileColors.warningSoft,
    borderColor: mobileColors.warningBorder,
    iconColor: mobileColors.warning,
    titleColor: mobileColors.textPrimary,
    bodyColor: mobileColors.textMuted,
    iconName: "warning-outline" as const,
    actionTone: "secondary" as const,
  },
  info: {
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brandBorder,
    iconColor: mobileColors.brand,
    titleColor: mobileColors.textPrimary,
    bodyColor: mobileColors.textMuted,
    iconName: "information-circle-outline" as const,
    actionTone: "secondary" as const,
  },
  success: {
    backgroundColor: mobileColors.successSoft,
    borderColor: mobileColors.successBorder,
    iconColor: mobileColors.success,
    titleColor: mobileColors.textPrimary,
    bodyColor: mobileColors.textMuted,
    iconName: "checkmark-circle-outline" as const,
    actionTone: "secondary" as const,
  },
} as const;

export function StatusBanner({
  title,
  body,
  tone = "error",
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  tone?: StatusBannerTone;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = STATUS_BANNER_TONE[tone];

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View style={styles.copyRow}>
        <View
          style={[
            styles.iconFrame,
            {
              backgroundColor: mobileColors.surface,
              borderColor: palette.borderColor,
            },
          ]}
        >
          <Ionicons color={palette.iconColor} name={palette.iconName} size={18} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.titleColor }]}>{title}</Text>
          {body ? (
            <Text style={[styles.body, { color: palette.bodyColor }]}>{body}</Text>
          ) : null}
        </View>
      </View>
      {actionLabel && onAction ? (
        <View style={styles.actionRow}>
          <Button
            compact
            label={actionLabel}
            onPress={onAction}
            tone={palette.actionTone}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  copyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconFrame: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  actionRow: {
    alignItems: "flex-start",
  },
});
