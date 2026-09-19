import { forwardRef, type ElementRef } from "react";
import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";
import { MAX_FONT_SCALE, MAX_FONT_SCALE_FIXED, MAX_TEXT_SIZE } from "../theme/tokens";

/**
 * Text that lives inside a shaped control: a pill's label, a button's label,
 * a badge's count, an avatar's initials, a header title beside its buttons.
 * The shape is what the reader recognises, so the text stays on one line and
 * scales to `MAX_FONT_SCALE_FIXED` at most, whatever the OS setting.
 *
 * - `"compact"` grows to that cap and truncates with an ellipsis when its
 *   row cannot take it. Pills, badges, chips, buttons, segments, tabs.
 * - `"shrink"` gives its scaling back instead of truncating: it shrinks until
 *   it fits. Only for text that fits at the default size and cannot be long,
 *   such as a header date or two initials. React Native's new architecture
 *   parses `minimumFontScale` but never applies it, so the shrink has no
 *   floor above 4pt, and it fits against the container's height as well as
 *   its width, so a fixed-height box shrinks a scaled label back below its
 *   base size. A button label is the worked example of what not to shrink.
 */
export type TextFit = "compact" | "shrink";

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
 * or marks the text `fit`, which caps it at `MAX_FONT_SCALE_FIXED`; the size
 * ceiling still applies to both.
 */
export function resolveTextMultiplier(
  fontSize: number | undefined,
  requested: number | null | undefined,
  fit?: TextFit,
): number {
  const ceiling = fit ? MAX_FONT_SCALE_FIXED : MAX_FONT_SCALE;
  const multiplier = Math.min(requested ?? ceiling, ceiling);
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

// A fitted text sits in a row beside an icon or a count, and has to be the
// part that gives way for the ellipsis to appear at all.
const FIT_STYLE = { flexShrink: 1 } as const;

export const Text = forwardRef<ElementRef<typeof NativeText>, TextProps>(function Text(
  { fit, maxFontSizeMultiplier, style, ...props },
  ref,
) {
  const fontSize = readFontSize(style);
  const fitProps: NativeTextProps = fit
    ? {
        ellipsizeMode: props.ellipsizeMode ?? "tail",
        numberOfLines: 1,
        ...(fit === "shrink" ? { adjustsFontSizeToFit: true } : null),
      }
    : {};
  return (
    <NativeText
      ref={ref}
      {...props}
      {...fitProps}
      maxFontSizeMultiplier={resolveTextMultiplier(fontSize, maxFontSizeMultiplier, fit)}
      style={fit ? [FIT_STYLE, style] : style}
    />
  );
});
