import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useAccessToken } from "../../features/auth/hooks/useAccessToken";
import { useBootstrap } from "../../features/auth/hooks/useBootstrap";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { usePressAnimation } from "../motion/usePressAnimation";
import { NumericBadge } from "../components/NumericBadge";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileElevation, mobileMotion, mobileRadii, type MobileColors } from "../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Outlined chrome, matching the schedule page's alerts bell
 * (`AlertsChromeButton`/`iconControlButton` in `scheduleScreenStyles.ts`): a
 * bordered `surface` pill rather than a borderless ghost icon, so the control
 * reads the same wherever it appears instead of only on a bar it happens to
 * share a color with.
 */
export function AlertsHeaderButton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const unreadCount = bootstrapQuery.data?.unreadNotificationCount ?? 0;
  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    rippleBorderless: true,
    scale: mobileMotion.press.iconOnlyScale,
  });
  const action = useAsyncAction(() => router.push("/alerts"));

  return (
    // The badge is absolutely positioned over the button rather than passed in
    // as an accessory, so it can overhang the icon's corner.
    <View style={styles.root}>
      <AnimatedPressable
        accessibilityLabel="Open alerts"
        accessibilityRole="button"
        android_ripple={androidRipple}
        onPress={action.run}
        {...pressHandlers}
        style={[styles.button, animatedStyle]}
      >
        <Ionicons color={mobileColors.textPrimary} name="notifications-outline" size={20} />
      </AnimatedPressable>
      <View pointerEvents="none" style={styles.badge}>
        <NumericBadge
          count={unreadCount}
          label={`${unreadCount} unread alerts`}
          max={9}
          size="sm"
          tone="danger"
        />
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    root: {
      position: "relative",
    },
    button: {
      width: 44,
      height: 44,
      borderRadius: mobileRadii.pill,
      // `border`, not `borderSubtle`: the edge is what makes this read as a
      // button rather than an icon floating on the page.
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surface,
      alignItems: "center",
      justifyContent: "center",
      ...mobileElevation("raised", isDark),
    },
    badge: {
      position: "absolute",
      // Centers the badge on the button's own ring at the top-right 45°
      // point (button radius 22, badge half-size 8: 22 - 22*sin(45°) - 8 ≈
      // -2 on both axes) rather than tucking it inside the circle.
      top: -2,
      right: -2,
    },
  });
