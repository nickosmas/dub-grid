export type ToastTimingTone = "success" | "info" | "warning" | "error";

/** How long each toast type stays, in ms, when the caller gives no duration (owner, 2026-10-31). */
export const TOAST_DURATION_MS: Record<ToastTimingTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 8000,
};

/** A toast with an action stays at least this long, so it can be read and pressed. */
export const TOAST_ACTION_MIN_DURATION_MS = 8000;

/** The default duration for a toast that has no duration of its own. */
export function resolveToastDuration(
  tone: ToastTimingTone,
  options: { hasAction?: boolean } = {},
): number {
  const base = TOAST_DURATION_MS[tone];
  return options.hasAction ? Math.max(base, TOAST_ACTION_MIN_DURATION_MS) : base;
}
