import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { hasCompleteName } from "@/lib/account-linking";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/cache";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { canManageEmployees, fetchProfileName, nameMismatchResponse } from "@/app/api/employees/shared";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  employeeId: z.string().uuid(),
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
});

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

    const [{ data: employee }, { data: membership }, { data: otherEmployees }, profileName] = await Promise.all([
      serviceClient
        .from("employees")
        .select("id, user_id, first_name, last_name")
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
      fetchProfileName(serviceClient, userId),
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
    if (!hasCompleteName(profileName)) {
      return nameMismatchResponse(
        {
          employeeId,
          userId,
          employeeFirstName: (employee.first_name as string | null) ?? "",
          employeeLastName: (employee.last_name as string | null) ?? "",
          accountFirstName: profileName.firstName ?? "",
          accountLastName: profileName.lastName ?? "",
        },
        "The user account must have a first and last name before it can be linked.",
      );
    }

    const updatePayload = {
      first_name: profileName.firstName,
      last_name: profileName.lastName,
      user_id: userId,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await serviceClient
      .from("employees")
      .update(updatePayload)
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
        details: {
          linkedUserId: userId,
          nameReconciled: true,
          resolution: "use_account_name",
          previousEmployeeFirstName: (employee.first_name as string | null) ?? "",
          previousEmployeeLastName: (employee.last_name as string | null) ?? "",
          accountFirstName: profileName.firstName ?? "",
          accountLastName: profileName.lastName ?? "",
        },
      }),
    ]);

    return NextResponse.json({ status: "linked" });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "employees/link-user/reconcile", employeeId, userId, orgId } });
    logger.error({ error: err, employeeId, userId, orgId }, "Failed to reconcile employee name and link user");
    return NextResponse.json({ error: "Failed to reconcile employee name and link user" }, { status: 500 });
  }
}
