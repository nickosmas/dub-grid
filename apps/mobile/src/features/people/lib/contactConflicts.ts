import type { MobileContactConflictReason } from "../../../shared/lib/api";

/**
 * What a taken email or phone reads as under the field. Word for word what web
 * shows for the same three cases, so the two apps explain a duplicate the same
 * way rather than each inventing its own phrasing.
 */
export const EMAIL_CONFLICT_MESSAGES: Record<MobileContactConflictReason, string> = {
  employee_duplicate: "That email is already used by another person on your team.",
  gridmaster: "That email address is reserved.",
  other_account: "That email belongs to a different user account.",
};

export const PHONE_CONFLICT_MESSAGE =
  "That phone number is already used by another person on your team.";
