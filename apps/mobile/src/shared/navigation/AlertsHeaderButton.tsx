import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAccessToken } from "../../features/auth/hooks/useAccessToken";
import { useBootstrap } from "../../features/auth/hooks/useBootstrap";
import { mobileColors } from "../theme/tokens";

export function AlertsHeaderButton() {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const unreadCount = bootstrapQuery.data?.unreadNotificationCount ?? 0;

  return (
    <Pressable
      accessibilityLabel="Open alerts"
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)", borderless: true }}
      hitSlop={10}
      onPress={() => router.push("/alerts")}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
      ]}
    >
      <Ionicons
        color={mobileColors.textPrimary}
        name="notifications-outline"
        size={20}
      />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  badge: {
    position: "absolute",
    top: 7,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.danger,
  },
  badgeText: {
    color: mobileColors.textInverse,
    fontSize: 10,
    fontWeight: "700",
  },
});
