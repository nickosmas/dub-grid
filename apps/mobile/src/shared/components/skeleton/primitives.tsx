import { useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { useMotionPreference } from "../../motion/useMotionPreference";
import { useIsDarkMode, useMobileColors } from "../../providers/ThemeModeProvider";
import {
  mobileMotion,
  mobileRadii,
  mobileRadius,
  mobileText,
  type MobileColors,
  type MobileTextVariant,
} from "../../theme/tokens";
import { getCardSurfaceStyle } from "../Screen";
import { SKELETON_WAVE_HOLD_POINT, useSkeletonWave } from "./useSkeletonWave";

/** Leading `rgb(`/`rgba(` channels, so only the alpha has to be rewritten. */
const RGB_CHANNELS = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/;

/**
 * The band's three gradient stops: the highlight fading in and back out through
 * its *own* colour at zero alpha.
 *
 * The outer stops are deliberately not `"transparent"`, which resolves to
 * `rgba(0,0,0,0)`. iOS draws the gradient with `CGGradient` in device RGB,
 * which interpolates the channels un-premultiplied: a ramp from black-at-0 to
 * white-at-0.62 passes through grey, so the band picks up a dirty shoulder on
 * each edge and the highlight only reads clean at its centre. Android's Skia
 * shader premultiplies and fades to nothing, which is why the identical code
 * has always looked better there.
 *
 * Holding the RGB identical across all three stops leaves the two engines with
 * only the alpha to interpolate, which they agree on, so both platforms draw
 * the same band.
 */
export function skeletonBandColors(highlight: string): readonly [string, string, string] {
  const channels = RGB_CHANNELS.exec(highlight.trim());
  // A non-`rgb()` token falls through to an opaque edge on purpose: that reads
  // as an obvious hard-edged bar, rather than silently restoring the grey
  // shoulder this exists to remove.
  const edge = channels ? `rgba(${channels[1]},${channels[2]},${channels[3]},0)` : highlight;

  return [edge, highlight, edge];
}

/**
 * The atom every other skeleton shape is built from: a filled block that lets
 * the app-wide shimmer band pass through it.
 *
 * The band is positioned in window coordinates (see `useSkeletonWave`), so the
 * block has to know where it sits horizontally. `measureInWindow` is the only
 * API that gives that — `onLayout` reports x relative to the parent, which for
 * anything inside a padded card is the wrong origin.
 */
export function SkeletonBlock({
  height,
  width = "100%",
  radius = mobileRadius.lg,
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const bandColors = useMemo(
    () => skeletonBandColors(mobileColors.skeletonHighlight),
    [mobileColors.skeletonHighlight],
  );
  const { wave, bandWidth, bandStartX, bandEndX, enabled } = useSkeletonWave();

  const viewRef = useRef<View>(null);
  // Defaults to 0 so the very first frame renders as if the block were flush to
  // the window's left edge, rather than not rendering the band at all. One
  // frame of a slightly-early highlight is invisible; a popping-in band is not.
  const [pageX, setPageX] = useState(0);

  const bandStyle = useAnimatedStyle(() => {
    const bandX = interpolate(
      wave.value,
      [0, SKELETON_WAVE_HOLD_POINT, 1],
      // Holds off-screen right through the rest beat instead of easing back.
      [bandStartX, bandEndX, bandEndX],
    );

    return { transform: [{ translateX: bandX - pageX }] };
  }, [bandStartX, bandEndX, pageX]);

  return (
    <View
      ref={viewRef}
      onLayout={() => {
        // Fires after layout, which is the earliest point the measurement is
        // meaningful. Re-runs on rotation and on any reflow that moves the
        // block, which is exactly when the band would otherwise drift.
        viewRef.current?.measureInWindow((x) => {
          if (Number.isFinite(x)) setPageX(x);
        });
      }}
      style={[styles.block, { height, width, borderRadius: radius }, style]}
    >
      {enabled ? (
        <Animated.View pointerEvents="none" style={[styles.band, { width: bandWidth }, bandStyle]}>
          <LinearGradient
            colors={bandColors}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Avatars and round icon frames. */
export function SkeletonCircle({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <SkeletonBlock height={size} radius={size / 2} style={style} width={size} />;
}

/** Rounded-square icon frames — the 32pt badge on cards and profile rows. */
export function SkeletonIcon({
  size = 32,
  radius = 10,
  style,
}: {
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonBlock height={size} radius={radius} style={style} width={size} />;
}

/**
 * A stand-in for one line of text, sized from the typography token it replaces.
 *
 * This is what keeps a skeleton from shifting the layout when content arrives:
 * the bar is `fontSize` tall and centred inside a `lineHeight`-tall box, so the
 * row occupies exactly the height the real text will.
 */
export function SkeletonLine({
  variant,
  width = "100%",
  style,
}: {
  variant: MobileTextVariant;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  const token = mobileText[variant];
  const fontSize = typeof token.fontSize === "number" ? token.fontSize : 14;
  const lineHeight = typeof token.lineHeight === "number" ? token.lineHeight : fontSize * 1.4;

  return (
    <View style={[{ height: lineHeight, justifyContent: "center" }, style]}>
      <SkeletonBlock height={fontSize} radius={mobileRadius.sm} width={width} />
    </View>
  );
}

/** Badges, chips, segmented controls and pill buttons. */
export function SkeletonPill({
  height,
  width,
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonBlock height={height} radius={mobileRadii.pill} style={style} width={width} />;
}

/**
 * The real `Card` surface with skeleton content inside it.
 *
 * Shares `getCardSurfaceStyle` with `Card` itself rather than restating the
 * radius/padding/shadow, so the placeholder cannot drift from the card.
 */
export function SkeletonCardSurface({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const cardStyle = useMemo(
    () => getCardSurfaceStyle(mobileColors, isDark),
    [mobileColors, isDark],
  );

  return <View style={[cardStyle, style]}>{children}</View>;
}

/**
 * Root of every skeleton composition.
 *
 * Carries the one `testID` the whole app asserts on — tests should care that a
 * placeholder is showing, not which silhouette it is — and the cross-fade that
 * stops the swap to real content from being a hard cut.
 */
export function SkeletonGroup({
  children,
  style,
  testID = "skeleton",
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const { d } = useMotionPreference();

  return (
    <Animated.View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      entering={FadeIn.duration(d(mobileMotion.duration.fast))}
      exiting={FadeOut.duration(d(mobileMotion.duration.instant))}
      style={style}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

/** Repeats a row builder `count` times with stable keys. */
export function skeletonRows(count: number, render: (index: number) => ReactNode) {
  return Array.from({ length: count }, (_, index) => render(index));
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    block: {
      backgroundColor: mobileColors.skeletonBase,
      // Clips the travelling band to the block's rounded corners.
      overflow: "hidden",
    },
    band: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
    },
  });
