import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { findAuthUserByEmail } from "@/lib/supabase-admin-users";
import { canManageEmployees } from "@/app/api/employees/shared";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { API_ERRORS } from "@dubgrid/client-errors";
import { validateCsrfOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().email(),
  orgId: z.string().uuid(),
});

/**
 * Pre-flight email lookup for the Add-Employee flow. Tells the admin whether
 * this person is already in the organization, and nothing about anyone else:
 * an account outside it, a Gridmaster's included, reads the same as no account.
 *
 * Returns:
 * - `exists`            — true if the address belongs to someone in this org.
 * - `displayName`       — that person's display name when present.
 * - `existsInThisOrg`   — true if they have a non-archived membership in the
 *                         caller's org. The UI uses this to hard-block
 *                         "you're inviting someone already in this org" before
 *                         the trigger / unique index fires.
 * - `existingEmployeeId`— their `employees.id` in this org when they have one
 *                         (so the UI can deep-link).
 *
 * Auth: must be an authenticated user with `canManageEmployees` on `orgId`.
 * Rate-limited per-user via the standard `apiLimiter`.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: API_ERRORS.RATE_LIMITED },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(reset)) },
      },
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
  const { email, orgId } = parsed.data;
  const normalized = email.toLowerCase();

  const serviceClient = getServiceClient();

  const hasPermission = await canManageEmployees(req, serviceClient, user.id, orgId);
  if (!hasPermission) {
    return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
  }

  // Match by lowercased email against auth.users. auth.users isn't a schema
  // PostgREST exposes (only public/graphql_public), so this goes through the
  // GoTrue admin API via findAuthUserByEmail rather than
  // serviceClient.schema("auth").from("users") — that call always fails
  // with PGRST106.
  const authUser = await findAuthUserByEmail(normalized);
  const matchedUserId = authUser?.id ?? null;
  if (!matchedUserId) {
    return NextResponse.json({
      exists: false,
      displayName: null,
      existsInThisOrg: false,
      existingEmployeeId: null,
    });
  }

  const [profileResult, membershipResult, employeeResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("first_name, last_name, platform_role")
      .eq("id", matchedUserId)
      .maybeSingle(),
    serviceClient
      .from("organization_memberships")
      .select("user_id")
      .eq("user_id", matchedUserId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
    serviceClient
      .from("employees")
      .select("id")
      .eq("user_id", matchedUserId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  // Someone outside this organization reads the same as nobody at all: whether
  // an address has an account elsewhere isn't this organization's to know (F-196).
  const inThisOrg = membershipResult.data !== null || employeeResult.data !== null;
  if (profile?.platform_role === "gridmaster" || !inThisOrg) {
    return NextResponse.json({
      exists: false,
      displayName: null,
      existsInThisOrg: false,
      existingEmployeeId: null,
    });
  }

  const displayName = profile
    ? [profile.first_name, profile.last_name]
        .filter((piece): piece is string => !!piece && piece.trim().length > 0)
        .join(" ") || null
    : null;

  return NextResponse.json({
    exists: true,
    displayName,
    existsInThisOrg: membershipResult.data !== null,
    existingEmployeeId: (employeeResult.data?.id as string | undefined) ?? null,
  });
}
