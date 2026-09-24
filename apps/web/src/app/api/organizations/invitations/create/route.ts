import { NextRequest, NextResponse } from "next/server";
import {
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie, requireAuthenticatedUser } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { canAssignOrgRole, canManageEmployees } from "@/app/api/employees/shared";
import { writeInvitationAuditEntry } from "@/lib/audit/invitation";
import { getRequestIp } from "@/features/mobile/server/management-roster";
import type { AssignableOrganizationRole } from "@/types";
import { buildStaffValidationErrorResponse, getStaffFieldErrors } from "@/lib/staff-validation";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import { INVITATION_LIFETIME_MS } from "@/lib/auth/invitation-capability";

const postSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["user", "admin", "super_admin"]),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  departmentIds: z.array(z.number().int()).optional(),
  deptAdminIds: z.array(z.number().int()).optional(),
});

type RefreshedInvitation = {
  invitationId: string;
  token: string;
  expiresAt: string;
};

/**
 * When the RPC reports an already-pending invite for this email, the row is often an
 * orphan from an earlier attempt whose email step failed (e.g. the resend_email kill
 * switch, or any transient Resend outage) — no email was ever delivered, but the row
 * blocks a retry. Instead of erroring, refresh that pending row (rotate its token, extend
 * expiry) and return it so the caller re-sends the email. Idempotent: the partial unique
 * index guarantees at most one pending row per (org_id, email), so this updates it in place.
 *
 * Scoped to `employeeId` (or explicitly no employee, for management-only invites) so this
 * only ever "refreshes" a genuine retry of the SAME invite. Without that check, inviting a
 * different employee with an email that already has a live pending row for someone else
 * would silently rotate and hand back that other employee's invitation as if it were a
 * fresh one — the caller believes it just invited person A, but the row (and whoever
 * accepts it) is actually still person B. Returns null if no matching pending row is found
 * (let the original "already exists" error surface instead).
 */
async function refreshPendingInvitation(
  serviceClient: ReturnType<typeof getServiceClient>,
  orgId: string,
  email: string,
  employeeId: string | null,
): Promise<RefreshedInvitation | null> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS).toISOString();

  const baseQuery = serviceClient
    .from("invitations")
    .update({ token, expires_at: expiresAt, revoked_at: null })
    .eq("org_id", orgId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gte("expires_at", new Date().toISOString());
  const scopedQuery = employeeId
    ? baseQuery.eq("employee_id", employeeId)
    : baseQuery.is("employee_id", null);

  const { data, error } = await scopedQuery.select("id, token, expires_at").maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    invitationId: data.id as string,
    token: data.token as string,
    expiresAt: data.expires_at as string,
  };
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

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

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  const {
    email,
    role,
    orgId,
    employeeId,
    firstName,
    lastName,
    phone,
    departmentIds,
    deptAdminIds,
  } = parsed.data;

  try {
    const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
    if (!hasPermission) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
    }

    // Regular admins with canManageEmployees can still invite admin/user.
    if (!(await canAssignOrgRole(serviceClient, user.id, orgId, role))) {
      // No invitation exists to hang this on, so the refusal is recorded
      // against the organization with the address that was attempted.
      await writeInvitationAuditEntry({
        orgId,
        actorId: user.id,
        actorEmail: user.email ?? null,
        action: "invitation.access_denied",
        resourceId: orgId,
        details: {
          email: normalizeRequiredStaffEmail(email),
          requestedRole: role,
          outcome: "rejected",
          reason: "policy_denied",
          path: "create",
        },
        ipAddress: getRequestIp(req),
        userAgent: req.headers.get("user-agent"),
      });
      return NextResponse.json({ error: API_ERRORS.CANNOT_ASSIGN_SUPER_ADMIN }, { status: 403 });
    }

    const fieldErrors = getStaffFieldErrors({
      email,
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });
    if (Object.keys(fieldErrors).length > 0) {
      return buildStaffValidationErrorResponse(fieldErrors);
    }

    const { data, error } = await serviceClient.rpc("send_invitation", {
      p_email: normalizeRequiredStaffEmail(email),
      p_role: role as AssignableOrganizationRole,
      p_org_id: orgId,
      p_employee_id: employeeId ?? null,
      p_first_name:
        typeof firstName === "string"
          ? firstName.trim()
            ? normalizeStaffName(firstName)
            : null
          : null,
      p_last_name:
        typeof lastName === "string"
          ? lastName.trim()
            ? normalizeStaffName(lastName)
            : null
          : null,
      p_phone: typeof phone === "string" ? normalizeOptionalUsPhone(phone) || null : null,
      p_department_ids: departmentIds ?? [],
      p_dept_admin_ids: deptAdminIds ?? [],
      // The service client has no auth.uid(), so the inviter is stated from
      // the authenticated session. The function verifies it holds the tier.
      p_invited_by: user.id,
    });
    if (error) throw error;

    const invitationId = data.invitation_id as string;
    // The registry has carried invitation.created and the employee activity
    // view has de-duplicated against it since before any route wrote one, so
    // creation was the one invitation event with no audit trail of its own.
    await writeInvitationAuditEntry({
      orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "invitation.created",
      resourceId: invitationId,
      details: {
        email: normalizeRequiredStaffEmail(email),
        role,
      },
      ipAddress: getRequestIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    void dispatchNotificationEvent(user.id, {
      action: "invitation_created",
      orgId,
      invitationId,
      inviteeEmail: normalizeRequiredStaffEmail(email),
    });

    return NextResponse.json({
      invitationId,
      token: data.token as string,
      expiresAt: data.expires_at as string,
    });
  } catch (error) {
    logger.error({ error }, "organization invitation create POST failed");
    // Surface the known send_invitation RPC errors with friendly messages
    // and correct status codes. Anything we don't recognize falls through
    // to a generic 500 so we don't leak internals.
    const rawMessage =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
    const text = rawMessage.toLowerCase();
    if (text.includes("user is already a member")) {
      return NextResponse.json(
        {
          error:
            "That user is already a member of this organization. Open their existing record to update their access.",
        },
        { status: 409 },
      );
    }
    if (text.includes("active invitation already exists")) {
      // Don't dead-end on a still-pending row: refresh it and return it so the caller
      // re-sends the email. This makes "retry with the same email" work after a first
      // attempt whose email step failed (e.g. the resend_email kill switch) left an
      // orphaned pending row behind. See refreshPendingInvitation above.
      try {
        const refreshed = await refreshPendingInvitation(
          serviceClient,
          orgId,
          normalizeRequiredStaffEmail(email),
          employeeId ?? null,
        );
        if (refreshed) {
          return NextResponse.json({ ...refreshed, resent: true });
        }
      } catch (refreshError) {
        logger.error({ error: refreshError }, "failed to refresh pending invitation on retry");
      }
      // No pending row found to refresh (or the refresh itself failed) — fall back to the
      // original guard message rather than claim success.
      return NextResponse.json(
        {
          error:
            "An invitation has already been sent to that email and is still pending. Revoke or resend the existing invitation instead.",
        },
        { status: 409 },
      );
    }
    if (text.includes("employee not found")) {
      return NextResponse.json(
        { error: "The selected employee record no longer exists." },
        { status: 404 },
      );
    }
    if (text.includes("employee already has a linked user")) {
      return NextResponse.json(
        {
          error: "That employee record is already linked to a user account.",
        },
        { status: 409 },
      );
    }
    if (text.includes("organization not found or archived")) {
      return NextResponse.json(
        { error: "This organization is no longer available." },
        { status: 404 },
      );
    }
    if (text.includes("unauthorized")) {
      return NextResponse.json(
        { error: "You don't have permission to send invitations here." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "We couldn't send that invitation. Try again." },
      { status: 500 },
    );
  }
}
