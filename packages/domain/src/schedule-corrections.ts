/** The longest reason a correction keeps; the reason is typed and optional (112). */
export const CORRECTION_REASON_MAX_LENGTH = 500;

/** Days before today an Admin may correct; earlier days need a Super Admin. */
export const CORRECTION_ADMIN_WINDOW_DAYS = 14;

// 110 stored one of these keys before the reason was typed.
const LEGACY_REASON_LABELS: Record<string, string> = {
  called_off: "Called off",
  left_early: "Left early",
  swapped: "Swapped with someone",
  wrong_shift: "Wrong shift recorded",
  other: "Other",
};

/** A correction's reason as people read it. */
export function correctionReasonLabel(reason: string): string {
  return LEGACY_REASON_LABELS[reason] ?? reason;
}
