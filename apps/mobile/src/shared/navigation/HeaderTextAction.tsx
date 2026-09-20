import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { Text } from "../components/Text";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { usePressAnimation } from "../motion/usePressAnimation";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileControl,
  mobileRadii,
  mobileSpace,
  mobileTextWeighted,
  type MobileColors,
} from "../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HeaderTextAction = {
  /** A verb, never an icon: "Edit", "Done", "Select". */
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

type HeaderTextActionOptions = Pick<NativeStackNavigationOptions, "headerRight">;

/**
 * A text action at the trailing end of the native navigation bar.
 *
 * It goes through `headerRight`, which react-native-screens wraps in a
 * `UIBarButtonItem` with a custom view. On iOS 26 UIKit gives that item the
 * same Liquid Glass capsule the back button wears (the subview's
 * `hidesSharedBackground` stays off), so the label sits in glass without the
 * app drawing any; earlier iOS shows the plain tinted label, and Android its
 * Material text action.
 *
 * Not native-stack's `unstable_headerRightItems`, though a real bar item would
 * be the textbook way to get the glass: native-stack 7.18 hands those to
 * react-native-screens as `title`/`titleStyle`, and the 4.17 pinned here
 * (for the iOS 26 back button) reads `label`/`labelStyle`, so the item came
 * up as an empty capsule on 2026-09-20. Revisit once screens is on 4.26+.
 *
 * Spread the result into the screen's `options`. Pass `null` to clear the
 * slot, e.g. while an inline editor owns the page's actions; the explicit
 * `undefined` is what overrides an item set on an earlier render.
 */
export function createHeaderTextAction(action: HeaderTextAction | null): HeaderTextActionOptions {
  if (!action) {
    return { headerRight: undefined };
  }

  return {
    headerRight: () => <HeaderTextButton {...action} />,
  };
}

/**
 * The bar's text button: the header's 44pt row in the header tint, like the
 * back arrow beside it, with its own background left clear so the platform's
 * capsule (or none) shows through.
 */
export function HeaderTextButton({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: HeaderTextAction) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    rippleBorderless: true,
    rippleColor: mobileColors.rippleNeutral,
  });
  const action = useAsyncAction(onPress);

  return (
    <AnimatedPressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      android_ripple={androidRipple}
      onPress={action.run}
      {...pressHandlers}
      style={[styles.button, animatedStyle]}
    >
      <Text fit="compact" style={styles.label}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    button: {
      // 36, not the 44 of every other control: iOS 26 draws the capsule as
      // the custom view plus 4pt on each side, clipped to the bar's 44. A
      // 44pt view therefore hung 4pt below the glass and its label sat low;
      // at 36 the view, the glass and the word share one centre. The bar
      // item itself still takes the full 44pt row of touches.
      minHeight: mobileControl.sm,
      paddingHorizontal: mobileSpace.md,
      borderRadius: mobileRadii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      ...mobileTextWeighted("cardTitle", "medium"),
      // The token's 22pt line box puts its spare leading above the glyphs on
      // iOS, a point or so of the same droop. The font's own line box centres
      // Inter's caps, and a lone word in a bar needs no text rhythm.
      lineHeight: undefined,
      color: mobileColors.textPrimary,
    },
  });
