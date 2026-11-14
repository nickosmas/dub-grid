import { EMAIL_UNAVAILABLE_MESSAGE } from "@dubgrid/client-errors";

export type EmployeeContactConflictField = "email" | "phone" | "name";

export const EMPLOYEE_CONTACT_CONFLICT_CODE = "EMPLOYEE_CONTACT_CONFLICT";

export interface EmployeeContactConflict {
  code: typeof EMPLOYEE_CONTACT_CONFLICT_CODE;
  error: string;
  field: EmployeeContactConflictField;
  message: string;
}

export const EMAIL_BELONGS_TO_SOMEONE_ELSE = "That email belongs to someone else.";
export const PHONE_BELONGS_TO_SOMEONE_ELSE = "That phone number belongs to someone else.";

/**
 * Why an email cannot be a person's contact or sign-in email:
 * `employee_duplicate` and `other_account` name someone in this organization;
 * `unavailable` covers an account anywhere else, a Gridmaster's included, and
 * never says the address belongs to anyone (owner, 2026-11-13).
 */
export type EmailConflictReason = "employee_duplicate" | "other_account" | "unavailable";

/** The one conflict answer for an email, whether a pre-check or the database found it. */
export function emailContactConflict(reason: EmailConflictReason): EmployeeContactConflict {
  const message =
    reason === "employee_duplicate"
      ? "That email is already used by another person."
      : reason === "other_account"
        ? "Someone else already signs in with that email. Use a different one."
        : EMAIL_UNAVAILABLE_MESSAGE;
  return { code: EMPLOYEE_CONTACT_CONFLICT_CODE, error: message, field: "email", message };
}

export function getEmployeeContactConflict(error: unknown): EmployeeContactConflict | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as {
    code?: unknown;
    constraint?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (record.code !== "23505") {
    return null;
  }

  const text = [record.constraint, record.details, record.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (text.includes("unique_active_employee_email_per_org")) {
    return emailContactConflict("employee_duplicate");
  }

  if (text.includes("unique_active_employee_phone_per_org")) {
    return {
      code: EMPLOYEE_CONTACT_CONFLICT_CODE,
      error: "That phone number is already used by another person.",
      field: "phone",
      message: "That phone number is already used by another person.",
    };
  }

  if (text.includes("employees_org_name_active_unique")) {
    return {
      code: EMPLOYEE_CONTACT_CONFLICT_CODE,
      error: "Someone in this organization already has that name.",
      field: "name",
      message: "Someone in this organization already has that name.",
    };
  }

  // check_employee_email_belongs_to_user (006) raised because the email is
  // another account's sign-in. Only its "member of this organization" case
  // may say so; a Gridmaster's address, or a linked record's clash with an
  // account that could be anywhere, gets the neutral answer.
  if (
    text.includes("employee_email_belongs_to_user") ||
    text.includes("employee_email_belongs_to_other_user") ||
    text.includes("employee_email_belongs_to_gridmaster")
  ) {
    return emailContactConflict(
      text.includes("member of this organization") ? "other_account" : "unavailable",
    );
  }

  return null;
}
