import { router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAccessToken } from "../../features/auth/hooks/useAccessToken";
import { useBootstrap } from "../../features/auth/hooks/useBootstrap";
import { Button } from "../components/Button";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";

export function AlertsHeaderButton() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const unreadCount = bootstrapQuery.data?.unreadNotificationCount ?? 0;

  return (
    // The badge is absolutely positioned over the button rather than passed in
    // as an accessory, so it can overhang the icon's corner.
    <View style={styles.root}>
      <Button
        accessibilityLabel="Open alerts"
        icon="notifications-outline"
        iconOnly
        onPress={() => router.push("/alerts")}
        tone="ghost"
      />
      {unreadCount > 0 ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      position: "relative",
    },
    badge: {
      position: "absolute",
      top: mobileSpace.xs,
      right: 0,
      minWidth: 16,
      height: 16,
      borderRadius: mobileRadii.pill,
      paddingHorizontal: mobileSpace.xs,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.danger,
    },
    badgeText: {
      ...mobileText.micro,
      color: mobileColors.textInverse,
    },
  });
