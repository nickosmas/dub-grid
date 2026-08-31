// Static UI constants — all schedule/org data is loaded from the database.

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Maximum number of individual shift occurrences a series can generate. */
export const MAX_SERIES_OCCURRENCES = 183;

/** Milliseconds in one day (24 * 60 * 60 * 1000). */
export const MS_PER_DAY = 86_400_000;

/** Cards stay flat and use their borders for separation. */
export const BOX_SHADOW_CARD = "none";

/** Default hover delay for Hint tooltips (ms). Keyboard focus opens instantly. */
export const TOOLTIP_DELAY_MS = 500;
