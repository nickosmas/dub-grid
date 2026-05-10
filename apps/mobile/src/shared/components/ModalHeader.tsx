import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileColors, mobileText } from "../theme/tokens";

export function ModalHeader({
  title,
  subtitle,
  closeLabel = "Close",
  closeDisabled = false,
  onClose,
}: {
  title: string;
  subtitle?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: closeDisabled }}
        android_ripple={
          closeDisabled
            ? undefined
            : { color: "rgba(15, 23, 42, 0.08)", borderless: true }
        }
        disabled={closeDisabled}
        hitSlop={8}
        onPress={onClose}
        style={({ pressed }) => [
          styles.closeButton,
          pressed && !closeDisabled && styles.closeButtonPressed,
          closeDisabled && styles.closeButtonDisabled,
        ]}
      >
        <Ionicons color={mobileColors.textSecondary} name="close" size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 10,
  },
  title: {
    ...mobileText.heroMetric,
    color: mobileColors.textPrimary,
  },
  subtitle: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  closeButtonDisabled: {
    opacity: 0.5,
  },
});
