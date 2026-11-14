import type { MobileContactConflictReason } from "../../../shared/lib/api";

/**
 * What a taken email or phone reads as under the field. Word for word what web
 * shows for the same three cases, so the two apps explain a duplicate the same
 * way rather than each inventing its own phrasing. Both name only someone in
 * this organization: an account anywhere else never reaches the check.
 */
export const EMAIL_CONFLICT_MESSAGES: Record<MobileContactConflictReason, string> = {
  employee_duplicate: "That email is already used by another person on your team.",
  other_account: "Someone else already signs in with that email. Use a different one.",
};

export const PHONE_CONFLICT_MESSAGE =
  "That phone number is already used by another person on your team.";

/**
 * Your own profile's answers, as web's My profile words them. They show only
 * when someone in your organizations uses the value; an address used anywhere
 * else reads as free while you type.
 */
export const OWN_EMAIL_TAKEN_MESSAGE = "That email belongs to someone else.";
export const OWN_PHONE_TAKEN_MESSAGE = "That phone number belongs to someone else.";
