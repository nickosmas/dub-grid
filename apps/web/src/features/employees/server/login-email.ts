import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMPLOYEE_CONTACT_CONFLICT_CODE,
  type EmployeeContactConflict,
} from "@/lib/employee-contact-conflicts";

export const LINKED_EMAIL_REQUIRED_MESSAGE = "An account needs an email to sign in with.";

/** Thrown when GoTrue refuses the new address because another account holds it. */
export class LoginEmailConflictError extends Error {
  readonly conflict: EmployeeContactConflict = {
    code: EMPLOYEE_CONTACT_CONFLICT_CODE,
    error: "That email belongs to a different user account.",
    field: "email",
    message: "That email belongs to a different user account.",
  };

  constructor() {
    super("login email already registered");
    this.name = "LoginEmailConflictError";
  }
}

/**
 * Does saving this staff record change the email the person signs in with?
 * Only a linked record has a login to change; a blank address is rejected
 * before this point because an account cannot sign in without one.
 */
export function getLoginEmailChange(input: {
  userId: string | null | undefined;
  previousEmail: string | null | undefined;
  nextEmail: string | null | undefined;
}): string | null {
  if (!input.userId) return null;
  const next = (input.nextEmail ?? "").trim();
  if (!next) return null;
  const previous = (input.previousEmail ?? "").trim();
  return next.toLowerCase() === previous.toLowerCase() ? null : next;
}

/**
 * The staff record's email is the login email. Change the account first:
 * GoTrue enforces that no other account holds the address, and the
 * sync_employee_email_from_auth trigger (migration 022) then rewrites every
 * linked staff row, so a later failure on the row itself leaves the two in
 * agreement rather than drifting apart.
 */
export async function syncLinkedLoginEmail(
  serviceClient: SupabaseClient,
  input: { userId: string; email: string },
): Promise<void> {
  const { error } = await serviceClient.auth.admin.updateUserById(input.userId, {
    email: input.email.trim(),
    email_confirm: true,
  });
  if (!error) return;
  const status = (error as { status?: number }).status;
  const code = (error as { code?: string }).code;
  if (
    status === 422 ||
    code === "email_exists" ||
    /already (?:been )?registered/i.test(error.message)
  ) {
    throw new LoginEmailConflictError();
  }
  throw error;
}
