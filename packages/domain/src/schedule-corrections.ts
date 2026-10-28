/** Why a past day was corrected (53a); the keys are stored as written. */
export const CORRECTION_REASONS = [
  { key: "called_off", label: "Called off" },
  { key: "left_early", label: "Left early" },
  { key: "swapped", label: "Swapped with someone" },
  { key: "wrong_shift", label: "Wrong shift recorded" },
  { key: "other", label: "Other" },
] as const;

export type CorrectionReason = (typeof CORRECTION_REASONS)[number]["key"];

export const CORRECTION_REASON_KEYS = CORRECTION_REASONS.map((reason) => reason.key) as [
  CorrectionReason,
  ...CorrectionReason[],
];

/** The longest note a correction keeps. */
export const CORRECTION_NOTE_MAX_LENGTH = 500;

/** Days before today an Admin may correct; earlier days need a Super Admin. */
export const CORRECTION_ADMIN_WINDOW_DAYS = 14;

export function correctionReasonLabel(reason: string): string {
  return CORRECTION_REASONS.find((entry) => entry.key === reason)?.label ?? reason;
}

/** Whether a correction with this reason must carry a note. */
export function correctionNeedsNote(reason: CorrectionReason): boolean {
  return reason === "other";
}
