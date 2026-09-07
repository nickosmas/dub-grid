import type { PropsWithChildren, ReactNode } from "react";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { usePressAnimation, type PressHaptic } from "../motion/usePressAnimation";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileMotion,
  mobileRadius,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

export type ButtonTone =
  | "primary"
  | "secondary"
  | "neutral"
  | "danger"
  | "success"
  | "warning"
  /**
   * A plain white pill whose colour comes from its icon rather than its fill.
   * Still solid and borderless like every other tone — it separates from the
   * tinted page the same way a card does.
   */
  | "plain"
  | "ghost"
  | "link";

export type ButtonSize = "sm" | "md" | "lg";

/** `"pill"` is the default, matching every other rounded control in the app
 * (chips, the segmented control, the tab strip). `"squircle"` is reserved for
 * the rare button that intentionally needs a tighter corner. */
export type ButtonShape = "pill" | "squircle";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The platform minimum for anything tappable. */
const MIN_TOUCH_TARGET = 44;

const SIZE = {
  sm: { minHeight: 36, paddingHorizontal: 14, gap: 6, icon: 16, iconOnly: 36 },
  md: { minHeight: 48, paddingHorizontal: 20, gap: 8, icon: 18, iconOnly: 44 },
  lg: { minHeight: 56, paddingHorizontal: 24, gap: 10, icon: 20, iconOnly: 52 },
} as const;

const LABEL_VARIANT = {
  sm: "bodyStrong",
  md: "rowTitle",
  lg: "cardTitle",
} as const satisfies Record<ButtonSize, keyof typeof mobileText>;

export function Button({
  children,
  label,
  tone = "primary",
  shape = "pill",
  size,
  compact = false,
  icon,
  iconPosition = "leading",
  iconOnly = false,
  accessibilityLabel,
  leadingAccessory,
  trailingAccessory,
  selected,
  expanded,
  disabled = false,
  loading,
  fullWidth,
  haptic = "selection",
  onPress,
}: PropsWithChildren<{
  label?: string;
  tone?: ButtonTone;
  shape?: ButtonShape;
  size?: ButtonSize;
  /** @deprecated pass `size="sm"`. */
  compact?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "leading" | "trailing";
  /** Icon button. Requires `accessibilityLabel`, since it has no text. */
  iconOnly?: boolean;
  accessibilityLabel?: string;
  /** @deprecated pass `icon`, or a node for genuinely custom accessories. */
  leadingAccessory?: ReactNode;
  /** Optional content after the label, such as a count badge. */
  trailingAccessory?: ReactNode;
  /** Toggle state for segment/filter usage. Surfaced to assistive tech. */
  selected?: boolean;
  /** Set when the button opens a sheet or panel, so screen readers announce it. */
  expanded?: boolean;
  disabled?: boolean;
  /**
   * Overrides the busy state the button works out for itself. Only needed when
   * the pending flag lives outside this button (a shared `actionLoading` keyed
   * by row, say); an `onPress` returning a promise already spins on its own.
   */
  loading?: boolean;
  /** Defaults to true for text buttons, false for `iconOnly`. */
  fullWidth?: boolean;
  haptic?: PressHaptic;
  /**
   * The press event is forwarded, so a button nested inside a pressable row can
   * call `stopPropagation` and keep the row from also firing.
   */
  onPress: (event: GestureResponderEvent) => void | Promise<unknown>;
}>) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  // A tap is easy to repeat, and `loading` only disables the pressable after
  // React re-renders, so a quick double-tap slips through and runs the action
  // twice. The latch inside `useAsyncAction` is a ref, checked synchronously
  // on the first press, so the second is already too late. A synchronous
  // `onPress` never spins.
  //
  // `||`, not `??`: a caller's own `loading` adds a pending state that lives
  // outside the press, it does not replace this one. With `??`, a screen
  // passing `loading={mutation.isPending}` silently suppressed the spinner
  // for any *other* async work the same press did.
  const action = useAsyncAction(onPress);
  const isBusy = Boolean(loading) || action.isRunning;

  const resolvedSize: ButtonSize = size ?? (compact ? "sm" : "md");
  const metrics = SIZE[resolvedSize];
  const isDisabled = disabled || isBusy;
  const stretches = fullWidth ?? !iconOnly;

  const labelColor = resolveLabelColor(tone, mobileColors);
  const rippleColor = resolveRippleColor(tone, mobileColors);
  const isBorderlessRipple = tone === "ghost" || tone === "link" || iconOnly;

  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    enabled: !isDisabled,
    haptic,
    rippleBorderless: isBorderlessRipple,
    rippleColor,
    // A small circular target needs a deeper press to register at all.
    scale: iconOnly ? mobileMotion.press.iconOnlyScale : mobileMotion.press.scale,
  });

  const content = children ?? label;
  const iconNode = icon ? (
    <Ionicons color={labelColor} name={icon} size={metrics.icon} />
  ) : (
    leadingAccessory
  );

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isBusy, selected, expanded }}
      android_ripple={androidRipple}
      disabled={isDisabled}
      // The `sm` icon-only square is 36pt, under the 44pt minimum touch target.
      // Pad the difference out rather than growing the button, which is drawn
      // small deliberately. Every other size already clears it.
      hitSlop={iconOnly ? Math.max(0, (MIN_TOUCH_TARGET - metrics.iconOnly) / 2) : undefined}
      onPress={action.run}
      {...pressHandlers}
      style={[
        styles.button,
        {
          minHeight: metrics.minHeight,
          paddingHorizontal: iconOnly ? 0 : metrics.paddingHorizontal,
        },
        // An icon-only button is a fixed square, so its own width/height define
        // the box. Leaving the base vertical padding on top of that squeezes the
        // content box below the glyph's line height, and `overflow: "hidden"`
        // then clips the icon.
        iconOnly && {
          width: metrics.iconOnly,
          height: metrics.iconOnly,
          paddingVertical: 0,
        },
        shape === "pill" && styles.buttonPill,
        stretches ? styles.buttonFullWidth : styles.buttonHugging,
        styles[TONE_STYLE[tone]],
        isDisabled && styles.buttonDisabled,
        animatedStyle,
      ]}
    >
      <View style={[styles.content, { gap: iconOnly ? 0 : metrics.gap }]}>
        {/* The spinner stands in for the icon while the button works. The
            action label stays unchanged; an icon-only button is spinner-only. */}
        {isBusy ? <ActivityIndicator color={labelColor} size="small" /> : null}
        {!isBusy && (iconOnly || iconPosition === "leading") ? iconNode : null}
        {!iconOnly && content ? (
          <Text
            adjustsFontSizeToFit
            ellipsizeMode="tail"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            minimumFontScale={0.75}
            numberOfLines={1}
            style={[mobileText[LABEL_VARIANT[resolvedSize]], styles.label, { color: labelColor }]}
          >
            {content}
          </Text>
        ) : null}
        {!isBusy && !iconOnly && iconPosition === "trailing" ? iconNode : null}
        {!iconOnly ? trailingAccessory : null}
      </View>
    </AnimatedPressable>
  );
}

const TONE_STYLE = {
  primary: "tonePrimary",
  secondary: "toneSecondary",
  neutral: "toneNeutral",
  danger: "toneDanger",
  success: "toneSuccess",
  warning: "toneWarning",
  plain: "tonePlain",
  ghost: "toneGhost",
  link: "toneLink",
} as const satisfies Record<ButtonTone, string>;

function resolveLabelColor(tone: ButtonTone, mobileColors: MobileColors): string {
  switch (tone) {
    case "primary":
      return mobileColors.onBrandText;
    case "secondary":
      // Paired with the darker secondary fill; the standard brand blue on that
      // fill measures 4.03:1 and fails AA.
      return mobileColors.controlSecondaryFg;
    case "link":
      return mobileColors.brand;
    case "neutral":
      return mobileColors.textSecondary;
    case "plain":
      // Full-strength text on a white fill. The colour on this tone belongs to
      // the icon, so the label stays neutral and lets it lead.
      return mobileColors.textPrimary;
    case "danger":
    // Both take the same white label, which is what lets them share a branch.
    // It is the `button*Bg` fills, not this colour, that carry the contrast: on
    // the shared `danger`/`success` tokens white measures 3.76:1 and 2.28:1,
    // both under the 4.5:1 floor.
    case "success":
      return mobileColors.textInverse;
    // The one solid tone that inverts that. Its fill is web's amber, which a
    // white label sits on at 2.15:1, so the contrast moves to the label.
    case "warning":
      return mobileColors.buttonWarningFg;
    case "ghost":
    default:
      return mobileColors.textMuted;
  }
}

function resolveRippleColor(tone: ButtonTone, mobileColors: MobileColors): string {
  if (tone === "primary" || tone === "danger" || tone === "success" || tone === "warning") {
    return mobileColors.ripplePrimary;
  }
  return mobileColors.rippleNeutral;
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    button: {
      // Borderless across every tone, matching the web button system. A solid
      // fill carries the button; an outline on top of it is the thing that
      // dates the look. This base radius is the squircle exception — the
      // default `shape="pill"` always layers `buttonPill` on top of it.
      borderRadius: mobileRadius.md,
      borderWidth: 0,
      paddingVertical: mobileSpace.md,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    buttonPill: {
      borderRadius: mobileRadii.pill,
    },
    buttonFullWidth: {
      alignSelf: "stretch",
    },
    buttonHugging: {
      alignSelf: "flex-start",
    },
    buttonDisabled: {
      // Deeper than the old 0.5: solid fills stay legible when dimmed, so they
      // need to fade further before they read as unavailable.
      opacity: 0.4,
    },
    // The four solid tones take the `button*Bg` ramp rather than the shared
    // semantic tokens: those are tuned for icons and banners, where the colour
    // sits beside text, and they fail AA under this button's white label.
    tonePrimary: {
      backgroundColor: mobileColors.buttonPrimaryBg,
    },
    toneSecondary: {
      backgroundColor: mobileColors.controlSecondaryBg,
    },
    toneNeutral: {
      backgroundColor: mobileColors.controlNeutralBg,
    },
    toneDanger: {
      backgroundColor: mobileColors.buttonDangerBg,
    },
    toneSuccess: {
      backgroundColor: mobileColors.buttonSuccessBg,
    },
    toneWarning: {
      backgroundColor: mobileColors.buttonWarningBg,
    },
    // Grey, not white. This took `surface`, which since the page went white is
    // the same colour as the ground behind it — an invisible button. Buttons
    // carry no border and no shadow, so the fill is the only thing that can
    // draw one.
    tonePlain: {
      backgroundColor: mobileColors.controlNeutralBg,
    },
    toneGhost: {
      backgroundColor: "transparent",
    },
    toneLink: {
      backgroundColor: "transparent",
    },
    label: {
      flexShrink: 1,
      textAlign: "center",
    },
    content: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
  });
