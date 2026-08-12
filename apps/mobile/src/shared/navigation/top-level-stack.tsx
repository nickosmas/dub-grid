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

/**
 * What a screen adds to take the platform's own large title.
 *
 * It carries NO background of its own, on purpose. Two separate things break
 * when it does. iOS 26 renders the title invisible when the header has an
 * explicit background color, which is why react-navigation resolves
 * `headerBackgroundColor` to transparent for large-title headers unless
 * something overrides it — and `createCommonStackOptions`' opaque `headerStyle`
 * was overriding it. And painting the bar another way, via `headerBackground`,
 * makes the header translucent and absolutely positioned, which costs the
 * collapse: the title showed but stopped shrinking into the bar on scroll.
 *
 * Transparent is what the page wants anyway. `Screen`'s scroll view is painted
 * with `background`, and it scrolls under the bar, so the color showing through
 * the header is the page's own — with the platform's real scroll-edge treatment
 * on top of it, which is the native look.
 *
 * Android has no large title to ask for: react-native-screens implements none
 * of the `largeTitle*` props there — every setter logs "largeTitle prop is not
 * available on Android" and does nothing — so it keeps the platform's own top
 * app bar and the opaque header `common` sets. Drawing a big collapsing title
 * there means drawing it in JS, which is not the same thing as a native one.
 */
const LARGE_TITLE_HEADER = {
  headerLargeTitle: true,
  headerLargeTitleEnabled: true,
  headerStyle: undefined,
} as const satisfies NativeStackNavigationOptions;

const PLAIN_TITLE_HEADER = {
  headerLargeTitle: false,
  headerLargeTitleEnabled: false,
} as const satisfies NativeStackNavigationOptions;

export function createTopLevelStackOptions(
  mobileColors: MobileColors,
  title: string,
): NativeStackNavigationOptions {
  return {
    ...createCommonStackOptions(mobileColors),
    title,
    ...(isIOS ? LARGE_TITLE_HEADER : PLAIN_TITLE_HEADER),
  };
}

export function createDetailStackOptions(
  mobileColors: MobileColors,
  title: string,
  /**
   * `largeTitle` for a pushed screen that should read as a place of its own
   * rather than a leaf. iOS uses large titles well below the root of a stack —
   * Settings does it at every level — and the People and Profile sections are
   * built that way throughout, so a person, an invite form and each profile
   * panel all get one. Modals and one-off detail screens keep the inline title.
   */
  { largeTitle = false }: { largeTitle?: boolean } = {},
): NativeStackNavigationOptions {
  return {
    ...createCommonStackOptions(mobileColors),
    title,
    ...(isIOS && largeTitle ? LARGE_TITLE_HEADER : PLAIN_TITLE_HEADER),
    // Full-width back swipe on iOS: a detail screen is a dead end, so the whole
    // surface should dismiss it rather than just the left edge.
    fullScreenGestureEnabled: isIOS,
  };
}
