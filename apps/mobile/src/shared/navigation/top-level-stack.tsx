import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import { mobileMotion, type MobileColors } from "../theme/tokens";

const isIOS = Platform.OS === "ios";

/**
 * Screen transitions come from the native stack, not from Reanimated.
 *
 * iOS "default" is the real UIKit push, including the interactive back swipe
 * and the parallax on the outgoing screen. Android gets its own slide at the
 * Material duration. Hand-rolling either would be strictly worse than the
 * platform's own.
 */
export function createStackTransitionOptions(): NativeStackNavigationOptions {
  return {
    animation: isIOS ? "default" : "slide_from_right",
    animationDuration: isIOS ? undefined : mobileMotion.duration.base,
  };
}

export function createCommonStackOptions(mobileColors: MobileColors): NativeStackNavigationOptions {
  return {
    headerBackVisible: true,
    headerBackButtonDisplayMode: "minimal",
    headerShadowVisible: false,
    headerTintColor: mobileColors.textPrimary,
    headerStyle: {
      backgroundColor: mobileColors.background,
    },
    headerTitleStyle: {
      color: mobileColors.textPrimary,
      fontWeight: "700",
    },
    headerLargeTitleStyle: {
      color: mobileColors.textPrimary,
      fontWeight: "700",
    },
    headerLargeTitleShadowVisible: false,
    contentStyle: {
      backgroundColor: mobileColors.background,
    },
    ...createStackTransitionOptions(),
  };
}

export function createTopLevelStackOptions(
  mobileColors: MobileColors,
  title: string,
): NativeStackNavigationOptions {
  const useLargeTitle = isIOS;
  const common = createCommonStackOptions(mobileColors);

  return {
    ...common,
    title,
    headerLargeTitle: useLargeTitle,
    headerLargeTitleEnabled: useLargeTitle,
    // Both surfaces take the page's own background. Dropping `headerStyle` for
    // large titles let the header fall through to the navigation theme's
    // `card`, which is pure white, while the page under it sits on `background`
    // — slate-50, faintly blue. That seam is only visible on iOS, since Android
    // never takes the large-title branch, and `headerLargeStyle` is what paints
    // the expanded title's own strip.
    headerLargeStyle: { backgroundColor: mobileColors.background },
  };
}

export function createDetailStackOptions(
  mobileColors: MobileColors,
  title: string,
): NativeStackNavigationOptions {
  return {
    ...createCommonStackOptions(mobileColors),
    title,
    headerLargeTitle: false,
    headerLargeTitleEnabled: false,
    // Full-width back swipe on iOS: a detail screen is a dead end, so the whole
    // surface should dismiss it rather than just the left edge.
    fullScreenGestureEnabled: isIOS,
  };
}
