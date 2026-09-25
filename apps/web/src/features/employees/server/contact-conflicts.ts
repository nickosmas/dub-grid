import type { SupabaseClient } from "@supabase/supabase-js";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";

export type EmployeeEmailConflictReason = "employee_duplicate" | "gridmaster" | "other_account";

export type EmployeeContactConflict = {
  conflict: boolean;
  conflictingEmployeeId: string | null;
  reason?: EmployeeEmailConflictReason;
};

/**
 * `ilike` reads `_` and `%` as wildcards, so `john_doe@x.com` would match
 * `john.doe@x.com`, which the case-insensitive unique index accepts.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Thrown so callers can answer with their own "we couldn't check that" copy. */
export class EmployeeContactLookupError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = "EmployeeContactLookupError";
  }
}

/**
 * Is this email already the contact email of a DIFFERENT active employee in this
 * org (mirrors `unique_active_employee_email_per_org`,
 * supabase/migrations/001_schema.sql), OR does it belong to an existing DubGrid
 * account that the DB trigger `check_employee_email_belongs_to_user`
 * (supabase/migrations/002_functions_triggers.sql,
 * 006_block_gridmaster_employee_email.sql) would reject at save time?
 *
 * The second case matters because an account's real login email often isn't
 * mirrored into `employees.email` at all - a Gridmaster has no employees row to
 * match, and a management-dept member's contact email field is commonly blank
 * even though their account is very much taken. Without this, typing one of
 * those emails shows no conflict, then fails only on submit.
 */
export async function checkEmployeeEmailConflict(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    email: string;
    excludeEmployeeId?: string;
    /**
     * The employee-being-edited's own linked account, if any. Lets someone keep
     * typing their own login email without tripping the "belongs to a different
     * account" case below.
     */
    currentUserId?: string | null;
  },
): Promise<EmployeeContactConflict> {
  const normalized = input.email.trim().toLowerCase();

  // Case 1: another active employee already has this exact contact email.
  let employeeQuery = serviceClient
    .from("employees")
    .select("id")
    .eq("org_id", input.orgId)
    .ilike("email", escapeLikePattern(normalized))
    .is("archived_at", null);
  if (input.excludeEmployeeId) {
    employeeQuery = employeeQuery.neq("id", input.excludeEmployeeId);
  }
  const { data: employeeMatch, error: employeeError } = await employeeQuery.limit(1).maybeSingle();
  if (employeeError) {
    throw new EmployeeContactLookupError("employees check-email lookup failed", employeeError);
  }
  if (employeeMatch) {
    return {
      conflict: true,
      conflictingEmployeeId: employeeMatch.id as string,
      reason: "employee_duplicate",
    };
  }

  // Case 2: the email belongs to an existing DubGrid account.
  //
  // auth.users isn't a schema PostgREST exposes (only public/graphql_public
  // are), so this goes through the GoTrue admin API via findAuthUserByEmail
  // rather than serviceClient.schema("auth").from("users") - that call always
  // fails with PGRST106.
  const authUser = await findAuthUserByEmail(normalized);
  const emailOwnerId = authUser?.id;
  if (!emailOwnerId) {
    return { conflict: false, conflictingEmployeeId: null };
  }

  // Same account this employee is already linked to - that's just their own
  // login email, not a conflict.
  if (input.currentUserId && emailOwnerId === input.currentUserId) {
    return { conflict: false, conflictingEmployeeId: null };
  }

  const { data: ownerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", emailOwnerId)
    .maybeSingle();
  if (profileError) {
    throw new EmployeeContactLookupError(
      "employees check-email profile lookup failed",
      profileError,
    );
  }
  if (ownerProfile?.platform_role === "gridmaster") {
    return { conflict: true, conflictingEmployeeId: null, reason: "gridmaster" };
  }

  // This employee is linked to a different account than the email's owner.
  if (input.currentUserId) {
    return { conflict: true, conflictingEmployeeId: null, reason: "other_account" };
  }

  // Unlinked employee: block only if the email's owner already has their own
  // active employee record in this org (found via user_id, not email - the
  // exact gap this check exists to close).
  let ownerEmployeeQuery = serviceClient
    .from("employees")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("user_id", emailOwnerId)
    .is("archived_at", null);
  if (input.excludeEmployeeId) {
    ownerEmployeeQuery = ownerEmployeeQuery.neq("id", input.excludeEmployeeId);
  }
  const { data: ownerEmployee, error: ownerEmployeeError } = await ownerEmployeeQuery
    .limit(1)
    .maybeSingle();
  if (ownerEmployeeError) {
    throw new EmployeeContactLookupError(
      "employees check-email owner lookup failed",
      ownerEmployeeError,
    );
  }
  if (ownerEmployee) {
    return {
      conflict: true,
      conflictingEmployeeId: ownerEmployee.id as string,
      reason: "other_account",
    };
  }

  return { conflict: false, conflictingEmployeeId: null };
}

/**
 * Is this number already the contact phone of a DIFFERENT active employee in
 * this org? Mirrors `unique_active_employee_phone_per_org`, which compares
 * digits only, so the conflict can be flagged before save instead of only
 * surfacing at invitation-accept time.
 */
export async function checkEmployeePhoneConflict(
  serviceClient: SupabaseClient,
  input: { orgId: string; phone: string; excludeEmployeeId?: string },
): Promise<EmployeeContactConflict> {
  const digits = input.phone.replace(/\D/g, "");
  if (!digits) {
    return { conflict: false, conflictingEmployeeId: null };
  }

  const { data, error } = await serviceClient
    .from("employees")
    .select("id, phone")
    .eq("org_id", input.orgId)
    .is("archived_at", null);
  if (error) {
    throw new EmployeeContactLookupError("employees check-phone lookup failed", error);
  }

  const conflictRow = (data ?? []).find((row) => {
    if (input.excludeEmployeeId && row.id === input.excludeEmployeeId) return false;
    return typeof row.phone === "string" && row.phone.replace(/\D/g, "") === digits;
  });

  return {
    conflict: !!conflictRow,
    conflictingEmployeeId: (conflictRow?.id as string | undefined) ?? null,
  };
}
