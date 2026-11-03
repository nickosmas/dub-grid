export type StatusIconTone = "success" | "warning" | "info" | "danger";

/**
 * A toast sits on a neutral surface, so its filled icon takes the bright tone
 * with a white mark, the same in light and dark.
 */
export const TOAST_ICON_FILL: Record<StatusIconTone, string> = {
  success: "#16A34A",
  warning: "#F59E0B",
  info: "#2563EB",
  danger: "#DC2626",
};

/**
 * A banner's icon sits on its own tint, so each colour is the brightest that
 * still stands off that tint (3:1 or near it; the bright amber and green fade
 * into theirs). Warning stays at 2.4:1 rather than turn brown; the banner's
 * words carry the meaning.
 */
const BANNER_ICON_COLOR: Record<"light" | "dark", Record<StatusIconTone, string>> = {
  light: { success: "#15803D", warning: "#D97706", info: "#2563EB", danger: "#DC2626" },
  dark: { success: "#4ADE80", warning: "#FBBF24", info: "#60A5FA", danger: "#F87171" },
};

export function bannerIconColor(tone: StatusIconTone, theme: "light" | "dark"): string {
  return BANNER_ICON_COLOR[theme][tone];
}
