import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/cache";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  employeeId: z.string().uuid(),
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
});

async function canManageEmployees(
  serviceClient: ReturnType<typeof getServiceClient>,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  const [{ data: membership }, { data: profile }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", actorId)
      .eq("org_id", orgId)
      .maybeSingle(),
    serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", actorId)
      .single(),
  ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  const isSuperAdmin = membership?.org_role === "super_admin";
  const isAdmin = membership?.org_role === "admin";
  const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;
  return isGridmaster || isSuperAdmin || (isAdmin && adminPerms?.canManageEmployees === true);
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { employeeId, userId, orgId } = parsed.data;
  const serviceClient = getServiceClient();

  try {
    const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
    if (!hasPermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const [{ data: employee }, { data: membership }, { data: otherEmployees }] = await Promise.all([
      serviceClient
        .from("employees")
        .select("id, user_id")
        .eq("id", employeeId)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient
        .from("organization_memberships")
        .select("user_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient
        .from("employees")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .neq("id", employeeId)
        .limit(1),
    ]);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found in this organization" }, { status: 404 });
    }
    if (!membership) {
      return NextResponse.json({ error: "User is not an active member of this organization" }, { status: 404 });
    }
    if ((otherEmployees?.length ?? 0) > 0) {
      return NextResponse.json({ error: "User is already linked to another employee in this organization" }, { status: 409 });
    }
    if (employee.user_id && employee.user_id !== userId) {
      return NextResponse.json({ error: "Employee already has a linked user account" }, { status: 409 });
    }
    if (employee.user_id === userId) {
      return NextResponse.json({ status: "linked" });
    }

    const { error } = await serviceClient
      .from("employees")
      .update({ user_id: userId, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", employeeId)
      .eq("org_id", orgId);

    if (error) throw error;

    await Promise.all([
      cacheDel(
        CacheKey.employees(orgId),
        CacheKey.employeeDetail(employeeId),
        CacheKey.orgUsers(orgId),
        CacheKey.orgDirectory(orgId),
      ),
      serviceClient.from("audit_log").insert({
        org_id: orgId,
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: "employee.updated",
        resource_type: "employee",
        resource_id: employeeId,
        details: { linkedUserId: userId },
      }),
    ]);

    return NextResponse.json({ status: "linked" });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "employees/link-user", employeeId, userId, orgId } });
    logger.error({ error: err, employeeId, userId, orgId }, "Failed to link employee to org user");
    return NextResponse.json({ error: "Failed to link employee to user" }, { status: 500 });
  }
}
