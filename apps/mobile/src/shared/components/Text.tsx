import { forwardRef, type ElementRef } from "react";
import {
  PixelRatio,
  Platform,
  Text as NativeText,
  type TextProps as NativeTextProps,
} from "react-native";
import { MAX_FONT_SCALE, MAX_FONT_SCALE_COMPACT, MAX_TEXT_SIZE } from "../theme/tokens";

/**
 * Text that is part of a control's shape rather than something to read at
 * length. Both tiers keep it on one line and truncate when the row cannot
 * take it, so the pill, button, tile or bar around it keeps its shape.
 *
 * - `"fixed"` renders at its designed size whatever the OS text setting:
 *   a header title beside its buttons, the tab bar, avatar initials, date
 *   tiles, count dots. Chrome holds still while the page grows, the way a
 *   navigation bar does.
 * - `"compact"` grows with the setting to `MAX_FONT_SCALE_COMPACT` and no
 *   further: button, pill, chip, badge, segment and tab labels, which the
 *   reader acts on and so should answer the setting a little.
 *
 * Shrinking to fit was tried instead and rejected: React Native's new
 * architecture parses `minimumFontScale` but never applies it, and fits
 * against the container's height as well as its width, so a button label at
 * a raised text size shrank to a fraction of its base size.
 */
export type TextFit = "fixed" | "compact";

export type TextProps = NativeTextProps & { fit?: TextFit };

/**
 * react-native's `Text` with the app's text-size limits applied by default.
 *
 * React Native honours the OS text-size setting with no ceiling of its own,
 * and the OS ceilings are high: iOS Larger Text reaches 310%. `MAX_FONT_SCALE`
 * has always been the app's answer, but it only held where a primitive
 * remembered to pass `maxFontSizeMultiplier`, which was a quarter of the
 * app's text. The rest scaled to the OS maximum, so a hero's time wrapped one
 * character per line while the button beside it stayed small. Every text in
 * the app now comes through here; the lint rule refuses the raw import.
 *
 * On top of the multiplier, `MAX_TEXT_SIZE` bounds the rendered size in
 * points, read from the style's `fontSize`, so a headline never outgrows the
 * row it sits in. A call site that needs a tighter multiplier passes its own,
 * or marks the text `fit="compact"`, which caps it at `MAX_FONT_SCALE_COMPACT`;
 * the size ceiling still applies to both.
 */
export function resolveTextMultiplier(
  fontSize: number | undefined,
  requested: number | null | undefined,
  fit?: TextFit,
): number {
  const ceiling = fit === "compact" ? MAX_FONT_SCALE_COMPACT : MAX_FONT_SCALE;
  const multiplier = Math.min(requested ?? ceiling, ceiling);
  if (!fontSize || fontSize <= 0) return multiplier;
  // React Native treats a value below 1 as no scaling at all, so the size
  // ceiling can shrink the multiplier to 1 but never past it.
  return Math.max(1, Math.min(multiplier, MAX_TEXT_SIZE / fontSize));
}

/** The numeric `key` a nested style array resolves to, last one wins, like the renderer. */
function readStyleNumber(style: unknown, key: "fontSize" | "lineHeight"): number | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return style.reduce<number | undefined>(
      (size, entry: unknown) => readStyleNumber(entry, key) ?? size,
      undefined,
    );
  }
  if (typeof style !== "object") return undefined;
  const value = (style as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

export function readFontSize(style: unknown): number | undefined {
  return readStyleNumber(style, "fontSize");
}

/**
 * The `lineHeight` to hand Android so the rendered line comes out at
 * `lineHeight * multiplier`, or undefined when the style's own value is right.
 *
 * Android scales `fontSize` by the OS setting capped at
 * `maxFontSizeMultiplier`, but scales `lineHeight` by the uncapped setting
 * (`TextAttributeProps.setLineHeight` calls `toPixelFromSP` without the
 * cap; `setFontSize` passes it). At a 2.0 setting with a 1.2 cap, a badge's
 * 11pt digits sat in a 28pt line: the count dot stretched into an oval and
 * every capped label carried air above and below that read as padding.
 * iOS applies the cap to both. Pre-dividing by the setting lets Android's
 * multiplication land on the capped value.
 */
export function androidLineHeight(
  lineHeight: number | undefined,
  multiplier: number,
  fontScale: number,
): number | undefined {
  if (lineHeight == null || fontScale <= multiplier) return undefined;
  return (lineHeight * multiplier) / fontScale;
}

// A fitted text sits in a row beside an icon or a count, and has to be the
// part that gives way for the ellipsis to appear at all.
const FIT_STYLE = { flexShrink: 1 } as const;

export const Text = forwardRef<ElementRef<typeof NativeText>, TextProps>(function Text(
  { fit, maxFontSizeMultiplier, style, ...props },
  ref,
) {
  const fitProps: NativeTextProps = fit
    ? {
        ellipsizeMode: props.ellipsizeMode ?? "tail",
        numberOfLines: 1,
        ...(fit === "fixed" ? { allowFontScaling: false } : null),
      }
    : {};
  const scales = fit !== "fixed" && props.allowFontScaling !== false;
  const multiplier = resolveTextMultiplier(readFontSize(style), maxFontSizeMultiplier, fit);
  const lineHeight =
    Platform.OS === "android" && scales
      ? androidLineHeight(
          readStyleNumber(style, "lineHeight"),
          multiplier,
          PixelRatio.getFontScale(),
        )
      : undefined;
  return (
    <NativeText
      ref={ref}
      {...props}
      {...fitProps}
      maxFontSizeMultiplier={multiplier}
      style={[fit ? FIT_STYLE : null, style, lineHeight != null ? { lineHeight } : null]}
    />
  );
});
