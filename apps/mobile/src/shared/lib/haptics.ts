import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function hapticSelection(): void {
  if (Platform.OS === "web") return;
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticImpact(strength: "light" | "medium" | "heavy" = "light"): void {
  if (Platform.OS === "web") return;
  const style =
    strength === "heavy"
      ? Haptics.ImpactFeedbackStyle.Heavy
      : strength === "medium"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  void Haptics.impactAsync(style).catch(() => {});
}

export function hapticNotify(type: "success" | "warning" | "error"): void {
  if (Platform.OS === "web") return;
  const feedback =
    type === "success"
      ? Haptics.NotificationFeedbackType.Success
      : type === "warning"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  void Haptics.notificationAsync(feedback).catch(() => {});
}
