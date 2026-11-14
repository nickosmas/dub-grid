import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import {
  forbidIfSandboxCookie,
  requireAuthenticatedUser,
  requireSensitiveActionAuth,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { rowToEmployee } from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import logger from "@/lib/logger";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { getServiceClient } from "@/lib/supabase-service";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { canManageEmployees, isOrgSuperAdminOrGridmaster } from "@/app/api/employees/shared";
import { deleteUserAccountWithCleanup } from "@/features/account/server/account-deletion";
import { getRequestIp } from "@/features/mobile/server/management-roster";

export const dynamic = "force-dynamic";

const CONFIRMATION = "DELETE ACCOUNT";
const USED_ELSEWHERE_MESSAGE =
  "This account is also used outside your organization, so it can't be deleted.";

const bodySchema = z.object({
  orgId: z.guid(),
  empId: z.guid(),
  confirmation: z.string(),
});

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

type ServiceClient = ReturnType<typeof getServiceClient>;

async function canManageSuperAdminOnly(
  req: NextRequest,
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  const [canManage, isSuperAdmin] = await Promise.all([
    canManageEmployees(req, serviceClient, actorId, orgId),
    isOrgSuperAdminOrGridmaster(serviceClient, actorId, orgId),
  ]);
  return canManage && isSuperAdmin;
}

async function usedInAnotherOrganization(
  serviceClient: ServiceClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { count, error } = await serviceClient
    .from("organization_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("org_id", orgId)
    .is("archived_at", null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function fetchEmployee(serviceClient: ServiceClient, orgId: string, empId: string) {
  const { data, error } = await serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", orgId)
    .eq("id", empId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEmployee(data as Parameters<typeof rowToEmployee>[0]) : null;
}

/**
 * GET /api/employees/delete-account?orgId=&empId=
 * Whether a Super Admin can delete this person's account from here, so the page
 * can say why not before anyone opens the dialog.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const parsed = bodySchema.omit({ confirmation: true }).safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
    empId: req.nextUrl.searchParams.get("empId"),
  });
  if (!parsed.success) return refuse(API_ERRORS.INVALID_INPUT, 400);

  try {
    const orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);
    const serviceClient = getServiceClient();
    if (!(await canManageSuperAdminOnly(req, serviceClient, user.id, orgId))) {
      return refuse(API_ERRORS.FORBIDDEN, 403);
    }
    const employee = await fetchEmployee(serviceClient, orgId, parsed.data.empId);
    if (!employee) return refuse("We couldn't find that person.", 404);
    return NextResponse.json({
      usedElsewhere: employee.userId
        ? await usedInAnotherOrganization(serviceClient, employee.userId, orgId)
        : false,
    });
  } catch (error) {
    logger.error({ error }, "reading whether an account can be deleted failed");
    return refuse(API_ERRORS.SERVICE_UNAVAILABLE, 500);
  }
}

/**
 * POST /api/employees/delete-account
 * A Super Admin permanently deletes the sign-in of someone they've offboarded.
 * The staff record, shifts and history stay. Offboarding comes first because
 * it's the reversible step, and an account also used in another organization
 * is refused, because deleting it would reach past this organization.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  const auth = await requireSensitiveActionAuth(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) return refuse(API_ERRORS.SERVICE_UNAVAILABLE, 503);
  if (limited) {
    return NextResponse.json(
      { error: API_ERRORS.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return refuse(API_ERRORS.INVALID_BODY, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return refuse(API_ERRORS.INVALID_INPUT, 400);
  const { empId, confirmation } = parsed.data;
  if (confirmation !== CONFIRMATION) {
    return refuse(`Confirmation text must be exactly: ${CONFIRMATION}`, 400);
  }

  try {
    const orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);
    const serviceClient = getServiceClient();
    if (!(await canManageSuperAdminOnly(req, serviceClient, user.id, orgId))) {
      return refuse(API_ERRORS.FORBIDDEN, 403);
    }

    const employee = await fetchEmployee(serviceClient, orgId, empId);
    if (!employee) return refuse("We couldn't find that person.", 404);
    const userId = employee.userId ?? null;
    if (!userId) return refuse("They don't have an account.", 409);
    if (userId === user.id) return refuse("Delete your own account on your profile.", 403);
    if (employee.status !== "removed") {
      return refuse("Offboard them before deleting their account.", 409);
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.platform_role === "gridmaster") return refuse(API_ERRORS.FORBIDDEN, 403);

    if (await usedInAnotherOrganization(serviceClient, userId, orgId)) {
      return refuse(USED_ELSEWHERE_MESSAGE, 409);
    }

    await deleteUserAccountWithCleanup({
      serviceClient,
      userId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      reason: "super_admin_deleted",
    });

    const now = new Date().toISOString();
    const { error: requestsError } = await serviceClient
      .from("profile_change_requests")
      .update({ status: "approved", resolver_user_id: user.id, resolved_at: now, updated_at: now })
      .eq("org_id", orgId)
      .eq("requester_user_id", userId)
      .eq("request_type", "account_deletion")
      .eq("status", "pending");
    if (requestsError) {
      logger.error({ error: requestsError, empId }, "closing a deletion request failed");
    }

    const { error: auditError } = await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "employee.account_deleted",
      resource_type: "employee",
      resource_id: empId,
      details: { employeeId: empId },
      ip_address: getRequestIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    if (auditError) logger.error({ error: auditError, empId }, "delete audit write failed");

    const refreshed = await fetchEmployee(serviceClient, orgId, empId);
    return NextResponse.json({ employee: refreshed ?? { ...employee, userId: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("They're the only Super Admin")) return refuse(message, 409);
    logger.error({ error, empId }, "deleting a staff member's account failed");
    return refuse("We couldn't delete that account. Try again.", 500);
  }
}
