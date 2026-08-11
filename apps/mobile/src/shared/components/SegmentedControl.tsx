import { useCallback, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { hapticSelection } from "../lib/haptics";
import { useMotionPreference } from "../motion/useMotionPreference";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileMotion, mobileRadii, mobileText, type MobileColors } from "../theme/tokens";

export type SegmentedControlSize = "sm" | "md";

export type SegmentedOption<Value extends string> = {
  value: Value;
  label: string;
};

const SIZE = {
  sm: { height: 30, paddingHorizontal: 10, labelVariant: "caption" },
  md: { height: 36, paddingHorizontal: 14, labelVariant: "label" },
} as const satisfies Record<
  SegmentedControlSize,
  { height: number; paddingHorizontal: number; labelVariant: keyof typeof mobileText }
>;

/** Inset of the thumb inside the track, on all four sides. */
const TRACK_PADDING = 2;

/**
 * A pill track with a single sliding thumb.
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
  accessibilityLabel,
}: {
  options: ReadonlyArray<SegmentedOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  size?: SegmentedControlSize;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const mobileColors = useMobileColors();
  const metrics = SIZE[size];
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
      style={[styles.track, { height: metrics.height }, disabled && styles.trackDisabled]}
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
              style={[
                mobileText[metrics.labelVariant],
                selected ? styles.labelSelected : styles.labelIdle,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    track: {
      flexDirection: "row",
      alignSelf: "flex-start",
      alignItems: "stretch",
      backgroundColor: mobileColors.controlNeutralBg,
      borderRadius: mobileRadii.pill,
      borderWidth: 0,
      padding: TRACK_PADDING,
    },
    trackDisabled: {
      opacity: 0.4,
    },
    thumb: {
      position: "absolute",
      top: TRACK_PADDING,
      bottom: TRACK_PADDING,
      backgroundColor: mobileColors.brand,
      borderRadius: mobileRadii.pill,
    },
    // No `flex`: the track is content-sized, so each segment sizes to its own
    // label. Adding flex here collapses every segment to zero width.
    segment: {
      alignItems: "center",
      justifyContent: "center",
    },
    labelIdle: {
      color: mobileColors.textMuted,
    },
    labelSelected: {
      color: mobileColors.onBrandText,
    },
  });
