import { NextRequest, NextResponse, after } from "next/server";
import { normalizeRequiredStaffEmail } from "@dubgrid/contracts";
import { API_ERRORS } from "@dubgrid/client-errors";
import { changedElsewhereMessage } from "@dubgrid/domain";
import { z } from "zod";
import { forbidIfSandboxCookie, requireSensitiveActionAuth } from "@/lib/api-auth";
import { writeInvitationAuditEntry } from "@/lib/audit/invitation";
import { validateCsrfOrigin } from "@/lib/csrf";
import { rowToEmployee } from "@/lib/db/mappers";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import { emailContactConflict, getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import logger from "@/lib/logger";
import {
  apiLimiter,
  checkRateLimit,
  emailTargetLimiter,
  hashEmail,
  inviteLimiter,
} from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { buildStaffValidationErrorResponse, getStaffFieldErrors } from "@/lib/staff-validation";
import { getServiceClient } from "@/lib/supabase-service";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { canManageEmployees, isOrgSuperAdminOrGridmaster } from "@/app/api/employees/shared";
import { checkEmployeeEmailConflict } from "@/features/employees/server/contact-conflicts";
import { endAccessInOrganization } from "@/features/employees/server/offboard-access";
import { scheduleSignInMovedNotice } from "@/features/employees/server/sign-in-moved-notice";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
} from "@/features/mobile/server/invitation-email";
import { getRequestIp } from "@/features/mobile/server/management-roster";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { sendPendingInvitationEmail } from "@/features/organization/server/invitation-delivery";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  empId: z.string().uuid(),
  email: z.string().trim().email(),
  expectedVersion: z.number().int().min(0),
});

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * POST /api/employees/move-email
 * For someone who lost their mailbox. The organization can't change a sign-in,
 * so it points its own staff record at a new address: that record leaves the
 * old sign-in, the old sign-in loses this organization and only this
 * organization, and an invite to the new address gives the record a sign-in
 * again, at the role it had. The person's other organizations are untouched.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  const auth = await requireSensitiveActionAuth(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return refuse(API_ERRORS.INVALID_BODY, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return refuse(API_ERRORS.INVALID_INPUT, 400);
  const { empId, expectedVersion } = parsed.data;

  const fieldErrors = getStaffFieldErrors({ email: parsed.data.email });
  if (Object.keys(fieldErrors).length > 0) return buildStaffValidationErrorResponse(fieldErrors);
  const email = normalizeRequiredStaffEmail(parsed.data.email);

  for (const [limiter, key] of [
    [apiLimiter, user.id],
    [inviteLimiter, user.id],
    [emailTargetLimiter, `invite-email:${hashEmail(email)}`],
  ] as const) {
    const limit = await checkRateLimit(limiter, key);
    if (limit.misconfigured) return refuse(API_ERRORS.SERVICE_UNAVAILABLE, 503);
    if (limit.limited) {
      return NextResponse.json(
        { error: API_ERRORS.RATE_LIMITED },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) } },
      );
    }
  }

  try {
    const orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);
    const serviceClient = getServiceClient();
    if (!(await canManageEmployees(req, serviceClient, user.id, orgId))) {
      return refuse(API_ERRORS.CANNOT_MANAGE_EMPLOYEES, 403);
    }

    const { data: row, error: rowError } = await serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("org_id", orgId)
      .eq("id", empId)
      .is("archived_at", null)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row) return refuse("We couldn't find that person.", 404);
    const employee = rowToEmployee(row as Parameters<typeof rowToEmployee>[0]);
    const previousUserId = employee.userId ?? null;

    if (!previousUserId) {
      return refuse("They haven't joined yet, so you can change this in Edit details.", 409);
    }
    if (previousUserId === user.id) {
      return refuse("Change your own email on your profile.", 403);
    }
    if (employee.status === "removed") return refuse("Restore them first.", 409);
    if (employee.version !== expectedVersion) {
      return NextResponse.json(
        { error: changedElsewhereMessage("their details"), code: "EMPLOYEE_CONFLICT", employee },
        { status: 409 },
      );
    }
    if (email.toLowerCase() === (employee.email ?? "").trim().toLowerCase()) {
      return buildStaffValidationErrorResponse({ email: "That's already their email." });
    }

    const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] =
      await Promise.all([
        serviceClient
          .from("organization_memberships")
          .select("org_role, admin_permissions, department_ids, dept_admin_ids")
          .eq("org_id", orgId)
          .eq("user_id", previousUserId)
          .is("archived_at", null)
          .maybeSingle(),
        serviceClient
          .from("profiles")
          .select("platform_role")
          .eq("id", previousUserId)
          .maybeSingle(),
      ]);
    if (membershipError) throw membershipError;
    if (profileError) throw profileError;
    if (profile?.platform_role === "gridmaster") return refuse(API_ERRORS.FORBIDDEN, 403);

    // The invite hands the record's access to whoever opens the new mailbox, so
    // only someone who could grant that access may send it. An Admin moving an
    // Admin would otherwise be choosing who holds their permissions.
    const role = (membership?.org_role as string | undefined) ?? "user";
    if (role !== "user" && !(await isOrgSuperAdminOrGridmaster(serviceClient, user.id, orgId))) {
      return refuse("Only a Super Admin can move an Admin or Super Admin.", 403);
    }
    if (role === "super_admin") {
      const { count, error: countError } = await serviceClient
        .from("organization_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("org_role", "super_admin")
        .is("archived_at", null);
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return refuse(
          "They're this organization's only Super Admin. Make someone else a Super Admin first.",
          409,
        );
      }
    }

    const emailConflict = await checkEmployeeEmailConflict(serviceClient, {
      orgId,
      email,
      excludeEmployeeId: empId,
      currentUserId: null,
    });
    if (emailConflict.conflict) {
      return NextResponse.json(emailContactConflict(emailConflict.reason ?? "employee_duplicate"), {
        status: 409,
      });
    }
    if (!getInvitationEmailConfig()) return createInvitationEmailUnavailableResponse();

    const { data: movedRow, error: moveError } = await serviceClient
      .from("employees")
      .update({ user_id: null, email, version: expectedVersion + 1 })
      .eq("org_id", orgId)
      .eq("id", empId)
      .eq("version", expectedVersion)
      .select(EMPLOYEE_COLS)
      .maybeSingle();
    if (moveError) throw moveError;
    if (!movedRow) {
      return NextResponse.json(
        { error: changedElsewhereMessage("their details"), code: "EMPLOYEE_CONFLICT" },
        { status: 409 },
      );
    }

    const at = new Date().toISOString();
    try {
      await endAccessInOrganization(serviceClient, {
        orgId,
        userId: previousUserId,
        actorId: user.id,
        at,
      });
    } catch (error) {
      // The old sign-in still holds this organization, so the move can't stand.
      await serviceClient
        .from("employees")
        .update({
          user_id: previousUserId,
          email: employee.email,
          version: expectedVersion + 2,
        })
        .eq("org_id", orgId)
        .eq("id", empId);
      throw error;
    }

    const requestContext = {
      ipAddress: getRequestIp(req),
      userAgent: req.headers.get("user-agent"),
    };
    const { error: auditError } = await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "employee.moved_to_new_email",
      resource_type: "employee",
      resource_id: empId,
      details: { employeeId: empId, from: { email: employee.email }, to: { email }, role },
      ip_address: requestContext.ipAddress,
      user_agent: requestContext.userAgent,
    });
    if (auditError) logger.error({ error: auditError, empId }, "move audit write failed");
    scheduleSignInMovedNotice(serviceClient, { email: employee.email, orgId });

    const invitationId = await inviteToNewAddress({
      serviceClient,
      orgId,
      empId,
      email,
      role,
      invitedBy: user.id,
      membership,
    });
    if (invitationId) {
      await writeInvitationAuditEntry({
        orgId,
        actorId: user.id,
        actorEmail: user.email ?? null,
        action: "invitation.created",
        resourceId: invitationId,
        details: { email, role },
        ...requestContext,
      });
      after(() =>
        dispatchNotificationEvent(user.id, {
          action: "invitation_created",
          orgId,
          invitationId,
          inviteeEmail: email,
        }),
      );
    }

    return NextResponse.json({
      employee: rowToEmployee(movedRow as Parameters<typeof rowToEmployee>[0]),
      invited: Boolean(invitationId),
    });
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) return NextResponse.json(contactConflict, { status: 409 });
    logger.error({ error, empId }, "moving a staff record to a new email failed");
    return refuse("We couldn't move them to that email. Try again.", 500);
  }
}

/**
 * Sent after the move has committed, so a failure here returns no invitation
 * rather than an error: the record is already on its new address, and the
 * person's page offers Send invite from there.
 */
async function inviteToNewAddress(input: {
  serviceClient: ReturnType<typeof getServiceClient>;
  orgId: string;
  empId: string;
  email: string;
  role: string;
  invitedBy: string;
  membership: {
    admin_permissions?: unknown;
    department_ids?: number[] | null;
    dept_admin_ids?: number[] | null;
  } | null;
}): Promise<string | null> {
  const { serviceClient, orgId, empId, email, role, invitedBy, membership } = input;
  try {
    const { data, error } = await serviceClient.rpc("send_invitation", {
      p_email: email,
      p_role: role,
      p_org_id: orgId,
      p_employee_id: empId,
      p_first_name: null,
      p_last_name: null,
      p_phone: null,
      p_department_ids: membership?.department_ids ?? [],
      p_dept_admin_ids: membership?.dept_admin_ids ?? [],
      p_invited_by: invitedBy,
    });
    if (error) throw error;

    const invitationId = data.invitation_id as string;
    const token = data.token as string;
    try {
      if (role === "admin" && membership?.admin_permissions) {
        const { error: permissionsError } = await serviceClient
          .from("invitations")
          .update({ admin_permissions: membership.admin_permissions })
          .eq("id", invitationId);
        if (permissionsError) throw permissionsError;
      }
      await sendPendingInvitationEmail({
        orgId,
        token,
        email,
        expiresAt: data.expires_at as string,
        kind: "moved",
      });
    } catch (sendError) {
      // Nobody received this link, so it must not stay live.
      await serviceClient
        .from("invitations")
        .delete()
        .eq("id", invitationId)
        .eq("token", token)
        .is("accepted_at", null);
      throw sendError;
    }
    return invitationId;
  } catch (error) {
    logger.error({ error, orgId, empId }, "invite after moving a staff record failed");
    return null;
  }
}
