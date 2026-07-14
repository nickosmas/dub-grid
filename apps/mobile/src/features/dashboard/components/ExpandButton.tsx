import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet } from "react-native";
import { mobileColors } from "../../../shared/theme/tokens";

// Mirrors web's ExpandButton (apps/web/src/components/dashboard/ExpandButton.tsx):
// a small icon-only button in a dashboard card's header that opens a full,
// expanded view of that card's content.
export function ExpandButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: mobileColors.rippleNeutral, borderless: true }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Ionicons color={mobileColors.textSecondary} name="expand-outline" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    backgroundColor: mobileColors.brandSoft,
  },
});
