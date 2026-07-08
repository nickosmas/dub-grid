export type EmployeeContactConflictField = "email" | "phone";

export const EMPLOYEE_CONTACT_CONFLICT_CODE = "EMPLOYEE_CONTACT_CONFLICT";

export interface EmployeeContactConflict {
  code: typeof EMPLOYEE_CONTACT_CONFLICT_CODE;
  error: string;
  field: EmployeeContactConflictField;
  message: string;
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
    return {
      code: EMPLOYEE_CONTACT_CONFLICT_CODE,
      error: "That email is already used by another person.",
      field: "email",
      message: "That email is already used by another person.",
    };
  }

  if (text.includes("unique_active_employee_phone_per_org")) {
    return {
      code: EMPLOYEE_CONTACT_CONFLICT_CODE,
      error: "That phone number is already used by another person.",
      field: "phone",
      message: "That phone number is already used by another person.",
    };
  }

  // employee_email_belongs_to_user / employee_email_belongs_to_other_user:
  // the BEFORE trigger raised because the email matches a different auth
  // user's account email. Surface as a contact conflict so the existing
  // EmployeeContactConflictError path on the client picks it up.
  if (
    text.includes("employee_email_belongs_to_user") ||
    text.includes("employee_email_belongs_to_other_user")
  ) {
    return {
      code: EMPLOYEE_CONTACT_CONFLICT_CODE,
      error: "That email belongs to a different user account.",
      field: "email",
      message: "That email belongs to a different user account.",
    };
  }

  return null;
}
