/**
 * Vibrant icon hues for mobile.
 *
 * A settings list is faster to scan by colour than by reading every label, so
 * each row's icon gets its own hue rather than a uniform gray.
 *
 * ## Why these are not the avatar palette
 * The avatar palette's foreground colours are tuned to clear WCAG AA as *text*
 * on a pale chip, which forces them deep — its `amber` is `#92400E`, which
 * reads as brown, and its `green` is a near-black forest. Correct for a name
 * badge, wrong for an icon that is supposed to look bright.
 *
 * These are bold, saturated shades instead. They are icon glyphs sitting beside
 * a text label, not the label itself: the label carries the meaning and the
 * contrast guarantee, so the icon is free to lean on colour.
 *
 * ## Why the set is small
 * It was briefly 14 hues, because an earlier rule forbade two icons on one
 * screen sharing a colour and the busiest screen has 12 of them. Covering that
 * meant reaching for `lime`, `amber` and a 600-level `yellow` — olive, brown
 * and mustard — plus three near-identical greens and four near-identical blues.
 * The result read as a swatch library rather than a chosen palette.
 *
 * Repeats on a screen are fine. Only *adjacent* rows sharing a hue looks
 * sloppy, and that constraint is satisfiable with six.
 */

export type MobileIconToneName =
  "blue" | "purple" | "teal" | "green" | "orange" | "pink" | "red" | "slate";

export type MobileIconTone = {
  light: string;
  dark: string;
};

/**
 * `dark` runs a step brighter than `light`: the same colour that pops on white
 * goes muddy against a near-black surface.
 */
export const mobileIconToneTokens: Record<MobileIconToneName, MobileIconTone> = {
  blue: { light: "#2563EB", dark: "#3B82F6" },
  purple: { light: "#7C3AED", dark: "#8B5CF6" },
  teal: { light: "#0D9488", dark: "#14B8A6" },
  green: { light: "#16A34A", dark: "#22C55E" },
  orange: { light: "#EA580C", dark: "#F97316" },
  pink: { light: "#DB2777", dark: "#EC4899" },
  /** Reserved for destructive rows. Never decoration — red has to keep meaning. */
  red: { light: "#DC2626", dark: "#EF4444" },
  /** The deliberate neutral, for rows with no meaning worth colouring. */
  slate: { light: "#475569", dark: "#64748B" },
};

/** Free to use anywhere. `red` and `slate` are excluded: both carry meaning. */
export const MOBILE_DECORATIVE_ICON_TONES = [
  "blue",
  "purple",
  "teal",
  "green",
  "orange",
  "pink",
] as const satisfies readonly MobileIconToneName[];

export function getMobileIconToneColor(name: MobileIconToneName, isDark: boolean): string {
  return isDark ? mobileIconToneTokens[name].dark : mobileIconToneTokens[name].light;
}
