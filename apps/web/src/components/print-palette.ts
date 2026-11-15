/**
 * The schedule grid's light-theme neutrals as literals, since the print
 * window carries none of the app's CSS variables. Each mirrors the
 * `--dg-color-*` token named beside it, so paper reads like the grid.
 */
export const PRINT_INK = {
  /** `--dg-color-grid-divider-strong`: the rule under the header and between weeks. */
  divider: "#171717",
  /** Section titles. */
  heading: "#171717",
  /** `--dg-color-text-secondary`: names and dates. */
  text: "#262626",
  /** `--dg-color-text-muted`: tally labels and counts. */
  muted: "#525252",
  /** The header's labels and a person's roles. */
  subtle: "#737373",
  /** `--dg-color-text-faint`: OFF and a zero count. */
  faint: "#858585",
  /** `--dg-color-border-strong`: the line above a section's totals. */
  borderStrong: "#A3A3A3",
  /** `--dg-color-border`: every line inside the table. */
  border: "#E5E5E5",
  /** `--dg-color-bg`: the Staff header cell. */
  headerFill: "#FCFCFC",
  surface: "#FFFFFF",
} as const;
