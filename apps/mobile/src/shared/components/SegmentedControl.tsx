import { useCallback, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Pressable } from "./Pressable";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { hapticSelection } from "../lib/haptics";
import { useMotionPreference } from "../motion/useMotionPreference";
import { useMobileColors, useThemeMode } from "../providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileMotion,
  mobilePillOverflow,
  mobileControl,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

export type SegmentedControlSize = "sm" | "md";

export type SegmentedOption<Value extends string> = {
  value: Value;
  label: string;
  /**
   * Optional count badge, drawn exactly as `ScrollableTabStrip` draws its own —
   * a count belongs in a pill beside the label, not spelled into it as
   * `Label (12)`. Omit entirely for controls that don't count anything; a zero
   * renders no badge, same as the strip.
   */
  count?: number;
};

const SIZE = {
  sm: { height: mobileControl.sm, paddingHorizontal: mobileSpace.md, labelVariant: "body" },
  md: { height: mobileControl.md, paddingHorizontal: mobileSpace.lg, labelVariant: "bodyStrong" },
} as const satisfies Record<
  SegmentedControlSize,
  { height: number; paddingHorizontal: number; labelVariant: keyof typeof mobileText }
>;

/** Inset of the thumb inside the track, on all four sides. */
const TRACK_PADDING = 2;

/**
 * A pill track with a single sliding thumb, styled after a native
 * iOS/Android segmented control tinted with the app's accent color: a raised
 * theme-blue thumb travels behind the selected label, with its own shadow so
 * it reads as floating above the neutral track rather than as a flat fill.
 *
 * Replaces the two hand-rolled segmented controls (the dashboard period toggle
 * and the requests tab strip), which both drew a *per-segment* background. A
 * shared thumb that travels is the difference between "three buttons, one of
 * which is filled" and a control that reads as one thing.
 */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  size = "md",
  disabled = false,
  track = "neutral",
  accessibilityLabel,
}: {
  options: ReadonlyArray<SegmentedOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  size?: SegmentedControlSize;
  disabled?: boolean;
  /**
   * `"background"` fills the track with the theme's ground (white in light,
   * black in dark) instead of the neutral grey, for a control sitting on a
   * coloured wash where a grey box reads as a patch. The thumb is unchanged.
   */
  track?: "neutral" | "background";
  accessibilityLabel?: string;
}) {
  const mobileColors = useMobileColors();
  const { resolvedTheme } = useThemeMode();
  const isDark = resolvedTheme === "dark";
  const metrics = SIZE[size];
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { enabled: motionEnabled, d } = useMotionPreference();

  // Each segment reports its own position and width.
  //
  // The track is content-sized (`alignSelf: "flex-start"`), so segments must
  // size to their labels — "Day" and "2 Weeks" are not the same width, and a
  // `flex: 1` child inside an auto-width row collapses to zero under Yoga,
  // which renders the control as an empty pill. Equal fractions would also
  // leave the thumb misaligned against those labels.
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const handleSegmentLayout = useCallback((optionValue: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) => {
      const previous = current[optionValue];
      if (previous && previous.x === x && previous.width === width) return current;
      return { ...current, [optionValue]: { x, width } };
    });
  }, []);

  const selectedLayout = layouts[value];

  // Resolved on the JS thread, never inside the worklet below: Reanimated
  // serializes a captured non-worklet function as a remote-function *object*,
  // so calling `d()` on the UI thread throws "d is not a function (it is
  // Object)". Worklets may only close over the resulting number. This branch
  // only runs under reduce-motion, which is why it stayed latent.
  const reducedDuration = d(mobileMotion.duration.fast);

  const thumbStyle = useAnimatedStyle(() => {
    if (!selectedLayout) return { width: 0, opacity: 0 };
    return {
      width: selectedLayout.width,
      opacity: 1,
      transform: [
        {
          translateX: motionEnabled
            ? withSpring(selectedLayout.x, mobileMotion.spring.snappy)
            : withTiming(selectedLayout.x, { duration: reducedDuration }),
        },
      ],
    };
  }, [reducedDuration, motionEnabled, selectedLayout?.width, selectedLayout?.x]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      style={[
        styles.track,
        { minHeight: metrics.height },
        track === "background" && styles.trackBackground,
        disabled && styles.trackDisabled,
      ]}
    >
      {/* Hidden via opacity until the selected segment has been measured, so it
          never flashes at zero width on first layout. */}
      <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]} />

      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            hitSlop={4}
            onPress={() => {
              if (option.value === value) return;
              hapticSelection();
              onChange(option.value);
            }}
            onLayout={(event) => handleSegmentLayout(option.value, event)}
            style={[styles.segment, { paddingHorizontal: metrics.paddingHorizontal }]}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[
                mobileText[metrics.labelVariant],
                mobilePillOverflow.interactiveText,
                selected ? styles.labelSelected : styles.labelIdle,
              ]}
            >
              {option.label}
            </Text>
            {option.count !== undefined && option.count > 0 ? (
              <View style={[styles.badge, selected && styles.badgeSelected]}>
                <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
                  {option.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    track: {
      ...mobilePillOverflow.interactiveContainer,
      flexDirection: "row",
      alignSelf: "flex-start",
      alignItems: "stretch",
      backgroundColor: mobileColors.controlNeutralBg,
      borderRadius: mobileRadii.pill,
      // A hairline around the outer track. The neutral fill alone sits at
      // 1.22:1 on a white page, which is only just perceivable, so the border
      // is what actually draws the control's outer edge. `controlNeutralBorder`
      // rather than `borderSubtle`: that one is tuned against white and
      // disappears into this fill at 1.02:1.
      borderWidth: 1,
      borderColor: mobileColors.controlNeutralBorder,
      padding: TRACK_PADDING,
    },
    trackBackground: {
      backgroundColor: mobileColors.background,
    },
    trackDisabled: {
      opacity: 0.4,
    },
    thumb: {
      position: "absolute",
      top: TRACK_PADDING,
      bottom: TRACK_PADDING,
      // Theme blue, like a native segmented/tab control tinted with the app's
      // accent color. The raised shadow still carries the "floating pill"
      // read; the color on top of it is what says *this* segment is active.
      backgroundColor: mobileColors.brand,
      borderRadius: mobileRadii.pill,
      ...mobileElevation("raised", isDark),
    },
    // No `flex`: the track is content-sized, so each segment sizes to its own
    // label. Adding flex here collapses every segment to zero width.
    segment: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: mobileSpace.sm,
      justifyContent: "center",
      minWidth: 0,
      overflow: "hidden",
    },
    labelIdle: {
      color: mobileColors.textSecondary,
    },
    labelSelected: {
      color: mobileColors.onBrandText,
    },
    badge: {
      minWidth: 20,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surface,
    },
    // Sits on the blue thumb, so it needs a translucent-on-color treatment
    // rather than the idle badge's opaque surface fill.
    badgeSelected: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    badgeText: {
      ...mobileText.badge,
      color: mobileColors.textMuted,
      textAlign: "center",
      includeFontPadding: false,
    },
    badgeTextSelected: {
      color: mobileColors.textInverse,
    },
  });
