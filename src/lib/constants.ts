// Static UI constants — all schedule/org data is loaded from the database.

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Maximum number of individual shift occurrences a series can generate. */
export const MAX_SERIES_OCCURRENCES = 183;

/** Milliseconds in one day (24 * 60 * 60 * 1000). */
export const MS_PER_DAY = 86_400_000;

/** Standard card box-shadow used across the app. */
export const BOX_SHADOW_CARD = "0 1px 4px rgba(0,0,0,0.04)";
