import { forwardRef, type ElementRef } from "react";
import { Text as NativeText, type TextProps } from "react-native";
import { MAX_FONT_SCALE, MAX_TEXT_SIZE } from "../theme/tokens";

/**
 * react-native's `Text` with the app's two text-size limits applied by default.
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
 * row it sits in. A call site that needs a tighter multiplier passes its own
 * (the floating tab bar and count dots use `MAX_FONT_SCALE_FIXED`); the size
 * ceiling still applies to it.
 */
export function resolveTextMultiplier(
  fontSize: number | undefined,
  requested: number | null | undefined,
): number {
  const multiplier = requested ?? MAX_FONT_SCALE;
  if (!fontSize || fontSize <= 0) return multiplier;
  // React Native treats a value below 1 as no scaling at all, so the size
  // ceiling can shrink the multiplier to 1 but never past it.
  return Math.max(1, Math.min(multiplier, MAX_TEXT_SIZE / fontSize));
}

/** The `fontSize` a nested style array resolves to, last one wins, like the renderer. */
export function readFontSize(style: unknown): number | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return style.reduce<number | undefined>(
      (size, entry: unknown) => readFontSize(entry) ?? size,
      undefined,
    );
  }
  if (typeof style !== "object") return undefined;
  const { fontSize } = style as { fontSize?: number | null };
  return typeof fontSize === "number" ? fontSize : undefined;
}

export const Text = forwardRef<ElementRef<typeof NativeText>, TextProps>(function Text(
  { maxFontSizeMultiplier, style, ...props },
  ref,
) {
  const fontSize = readFontSize(style);
  return (
    <NativeText
      ref={ref}
      maxFontSizeMultiplier={resolveTextMultiplier(fontSize, maxFontSizeMultiplier)}
      style={style}
      {...props}
    />
  );
});

export type { TextProps };
