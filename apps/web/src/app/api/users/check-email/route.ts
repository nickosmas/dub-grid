import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().email(),
  orgId: z.string().uuid(),
});

/**
 * Pre-flight email lookup for the Add-Employee flow. Tells the admin whether
 * the email already maps to a DubGrid user (any org), without revealing
 * which orgs that user belongs to.
 *
 * Returns:
 * - `exists`            — true if a `auth.users` row matches the email.
 * - `displayName`       — the matched profile's display name when present.
 * - `existsInThisOrg`   — true if the matched user has a non-archived
 *                         membership in the caller's org. The UI uses this
 *                         to hard-block "you're inviting someone already in
 *                         this org" before the trigger / unique index fires.
 * - `existingEmployeeId`— the matched user's `employees.id` in this org
 *                         when they have one (so the UI can deep-link).
 *
 * Auth: must be an authenticated user with `canManageEmployees` on `orgId`.
 * Rate-limited per-user via the standard `apiLimiter`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    user.id,
  );
  if (misconfigured) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, orgId } = parsed.data;
  const normalized = email.toLowerCase();

  const serviceClient = getServiceClient();

  const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
  if (!hasPermission) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  // Match by lowercased email against auth.users. Service-role required.
  const { data: matchedUsers, error: authLookupErr } = await serviceClient
    .schema("auth")
    .from("users")
    .select("id")
    .ilike("email", normalized)
    .limit(1);
  if (authLookupErr) {
    console.error("check-email auth lookup failed", authLookupErr);
    return NextResponse.json(
      { error: "Failed to look up user" },
      { status: 500 },
    );
  }
  const matchedUserId = matchedUsers?.[0]?.id ?? null;
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
      .select("first_name, last_name")
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
