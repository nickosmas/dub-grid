/**
 * One contract for every numeric count badge (unread alerts, tab and request
 * counts, open-shift and staffing-needed counts) on web and mobile. A badge is
 * always a pill: `size` is its height and minimum width, so a one-digit value
 * reads as a circle only because its content is narrower than the minimum.
 *
 * `sm` is the floating indicator on an icon button; `md` is an inline count.
 */
export const numericBadgeSize = {
  sm: { size: 16, paddingX: 4 },
  md: { size: 20, paddingX: 6 },
} as const;

export type NumericBadgeSize = keyof typeof numericBadgeSize;

export const NUMERIC_BADGE_MAX = 99;

/**
 * The text a count badge shows, or `null` when it should not render at all.
 * Counts above `max` clamp to `${max}+`; bell badges pass 9, everything else
 * takes the default.
 */
export function formatBadgeCount(count: number, max = NUMERIC_BADGE_MAX): string | null {
  if (!Number.isFinite(count)) return null;
  const whole = Math.floor(count);
  if (whole <= 0) return null;
  return whole > max ? `${max}+` : String(whole);
}
