import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";
import { canManageEmployees } from "@/app/api/employees/shared";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().email(),
  orgId: z.string().uuid(),
  excludeEmployeeId: z.string().uuid().optional(),
  /** The employee-being-edited's own linked account, if any — lets someone
   *  keep typing their own login email without tripping the "belongs to a
   *  different account" case below. */
  currentUserId: z.string().uuid().nullable().optional(),
});

/**
 * Pre-flight check for the invite / management-access email field: is this
 * email already the contact email of a DIFFERENT active employee in this
 * org (mirrors `unique_active_employee_email_per_org`,
 * supabase/migrations/001_schema.sql), OR does it belong to an existing
 * DubGrid account that the DB trigger `check_employee_email_belongs_to_user`
 * (supabase/migrations/002_functions_triggers.sql,
 * 006_block_gridmaster_employee_email.sql) would reject at save time?
 *
 * The second case matters because an account's real login email often isn't
 * mirrored into `employees.email` at all — a Gridmaster has no employees row
 * to match, and a management-dept member's contact email field is commonly
 * blank even though their account is very much taken. Without this, typing
 * one of those emails here shows no conflict, then fails only on submit.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }
  const { email, orgId, excludeEmployeeId, currentUserId } = parsed.data;
  const normalized = email.trim().toLowerCase();

  const serviceClient = getServiceClient();
  const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
  if (!hasPermission) {
    return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
  }

  // Case 1: another active employee already has this exact contact email.
  let employeeQuery = serviceClient
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", normalized)
    .is("archived_at", null);
  if (excludeEmployeeId) {
    employeeQuery = employeeQuery.neq("id", excludeEmployeeId);
  }
  const { data: employeeMatch, error: employeeError } = await employeeQuery.limit(1).maybeSingle();
  if (employeeError) {
    logger.error({ error: employeeError }, "employees check-email lookup failed");
    return NextResponse.json(
      { error: "We couldn't check that email. Try again." },
      { status: 500 },
    );
  }
  if (employeeMatch) {
    return NextResponse.json({
      conflict: true,
      conflictingEmployeeId: employeeMatch.id as string,
      reason: "employee_duplicate" as const,
    });
  }

  // Case 2: the email belongs to an existing DubGrid account. Mirrors
  // check_employee_email_belongs_to_user's logic exactly, since that's the
  // constraint that will otherwise reject this on submit.
  //
  // auth.users isn't a schema PostgREST exposes (only public/graphql_public
  // are), so this goes through the GoTrue admin API via findAuthUserByEmail
  // rather than serviceClient.schema("auth").from("users") — that call
  // always fails with PGRST106.
  const authUser = await findAuthUserByEmail(normalized);
  const emailOwnerId = authUser?.id;
  if (!emailOwnerId) {
    return NextResponse.json({ conflict: false, conflictingEmployeeId: null });
  }

  // Same account this employee is already linked to — that's just their own
  // login email, not a conflict.
  if (currentUserId && emailOwnerId === currentUserId) {
    return NextResponse.json({ conflict: false, conflictingEmployeeId: null });
  }

  const { data: ownerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", emailOwnerId)
    .maybeSingle();
  if (profileError) {
    logger.error({ error: profileError }, "employees check-email profile lookup failed");
    return NextResponse.json(
      { error: "We couldn't check that email. Try again." },
      { status: 500 },
    );
  }
  if (ownerProfile?.platform_role === "gridmaster") {
    return NextResponse.json({
      conflict: true,
      conflictingEmployeeId: null,
      reason: "gridmaster" as const,
    });
  }

  // This employee is linked to a different account than the email's owner.
  if (currentUserId) {
    return NextResponse.json({
      conflict: true,
      conflictingEmployeeId: null,
      reason: "other_account" as const,
    });
  }

  // Unlinked employee: block only if the email's owner already has their own
  // active employee record in this org (found via user_id, not email — the
  // exact gap this route exists to close).
  let ownerEmployeeQuery = serviceClient
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", emailOwnerId)
    .is("archived_at", null);
  if (excludeEmployeeId) {
    ownerEmployeeQuery = ownerEmployeeQuery.neq("id", excludeEmployeeId);
  }
  const { data: ownerEmployee, error: ownerEmployeeError } = await ownerEmployeeQuery
    .limit(1)
    .maybeSingle();
  if (ownerEmployeeError) {
    logger.error({ error: ownerEmployeeError }, "employees check-email owner lookup failed");
    return NextResponse.json(
      { error: "We couldn't check that email. Try again." },
      { status: 500 },
    );
  }
  if (ownerEmployee) {
    return NextResponse.json({
      conflict: true,
      conflictingEmployeeId: ownerEmployee.id as string,
      reason: "other_account" as const,
    });
  }

  return NextResponse.json({ conflict: false, conflictingEmployeeId: null });
}
