import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileColors, mobileRadii } from "../theme/tokens";

type ButtonTone = "primary" | "secondary" | "neutral" | "danger" | "ghost";

export function Button({
  children,
  label,
  tone = "primary",
  disabled = false,
  compact = false,
  leadingAccessory,
  onPress,
}: PropsWithChildren<{
  label?: string;
  tone?: ButtonTone;
  disabled?: boolean;
  compact?: boolean;
  leadingAccessory?: ReactNode;
  onPress: () => void;
}>) {
  const content = children ?? label;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        tone === "primary" && styles.buttonPrimary,
        tone === "secondary" && styles.buttonSecondary,
        tone === "neutral" && styles.buttonNeutral,
        tone === "danger" && styles.buttonDanger,
        tone === "ghost" && styles.buttonGhost,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View style={styles.content}>
        {leadingAccessory ? (
          <View style={styles.leadingAccessory}>{leadingAccessory}</View>
        ) : null}
        <Text
          style={[
            styles.label,
            tone === "primary" && styles.labelPrimary,
            tone === "secondary" && styles.labelSecondary,
            tone === "neutral" && styles.labelNeutral,
            tone === "danger" && styles.labelDanger,
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
    minHeight: 40,
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
    fontSize: 15,
    fontWeight: "700",
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
    color: mobileColors.danger,
  },
  labelGhost: {
    color: mobileColors.textMuted,
  },
});
