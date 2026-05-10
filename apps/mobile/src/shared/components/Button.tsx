import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { mobileColors, mobileRadii, mobileText } from "../theme/tokens";

export type ButtonTone =
  | "primary"
  | "secondary"
  | "neutral"
  | "danger"
  | "dangerFilled"
  | "warningFilled"
  | "success"
  | "link"
  | "ghost";

export function Button({
  children,
  label,
  tone = "primary",
  disabled = false,
  compact = false,
  leadingAccessory,
  loading = false,
  onPress,
}: PropsWithChildren<{
  label?: string;
  tone?: ButtonTone;
  disabled?: boolean;
  compact?: boolean;
  leadingAccessory?: ReactNode;
  loading?: boolean;
  onPress: () => void;
}>) {
  const content = children ?? label;
  const isDisabled = disabled || loading;
  const spinnerColor =
    tone === "primary" || tone === "dangerFilled" || tone === "warningFilled"
      ? mobileColors.textInverse
      : tone === "danger"
        ? mobileColors.dangerText
        : tone === "neutral" || tone === "ghost"
          ? mobileColors.textMuted
          : mobileColors.brand;
  const rippleColor =
    tone === "primary"
      ? "rgba(255, 255, 255, 0.22)"
      : "rgba(15, 23, 42, 0.08)";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={isDisabled ? undefined : { color: rippleColor }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        tone === "primary" && styles.buttonPrimary,
        tone === "secondary" && styles.buttonSecondary,
        tone === "neutral" && styles.buttonNeutral,
        tone === "danger" && styles.buttonDanger,
        tone === "dangerFilled" && styles.buttonDangerFilled,
        tone === "warningFilled" && styles.buttonWarningFilled,
        tone === "success" && styles.buttonSuccess,
        tone === "link" && styles.buttonLink,
        tone === "ghost" && styles.buttonGhost,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={spinnerColor} size="small" />
        ) : leadingAccessory ? (
          <View style={styles.leadingAccessory}>{leadingAccessory}</View>
        ) : null}
        <Text
          style={[
            styles.label,
            tone === "primary" && styles.labelPrimary,
            tone === "secondary" && styles.labelSecondary,
            tone === "neutral" && styles.labelNeutral,
            tone === "danger" && styles.labelDanger,
            tone === "dangerFilled" && styles.labelFilled,
            tone === "warningFilled" && styles.labelFilled,
            tone === "success" && styles.labelSuccess,
            tone === "link" && styles.labelLink,
            tone === "ghost" && styles.labelGhost,
          ]}
        >
          {content}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: mobileRadii.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
  buttonCompact: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimary: {
    backgroundColor: mobileColors.brand,
    borderColor: mobileColors.brand,
  },
  buttonSecondary: {
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brandBorder,
  },
  buttonNeutral: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
  },
  buttonDanger: {
    backgroundColor: mobileColors.dangerSoft,
    borderColor: mobileColors.dangerBorder,
  },
  buttonDangerFilled: {
    backgroundColor: mobileColors.danger,
    borderColor: mobileColors.danger,
  },
  buttonWarningFilled: {
    backgroundColor: mobileColors.warning,
    borderColor: mobileColors.warning,
  },
  buttonSuccess: {
    backgroundColor: mobileColors.successSoft,
    borderColor: mobileColors.successBorder,
  },
  buttonLink: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  leadingAccessory: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...mobileText.bodyStrong,
  },
  labelPrimary: {
    color: mobileColors.textInverse,
  },
  labelSecondary: {
    color: mobileColors.brand,
  },
  labelNeutral: {
    color: mobileColors.textSecondary,
  },
  labelDanger: {
    color: mobileColors.dangerText,
  },
  labelFilled: {
    color: mobileColors.textInverse,
  },
  labelSuccess: {
    color: mobileColors.successText,
  },
  labelLink: {
    color: mobileColors.brand,
  },
  labelGhost: {
    color: mobileColors.textMuted,
  },
});
