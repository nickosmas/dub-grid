import { NextRequest, NextResponse } from "next/server";
import {
  normalizeOptionalUsPhone,
  normalizeOptionalStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { z } from "zod";
import { apiLimiter, checkRateLimit, emailTargetLimiter, hashEmail } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { forbidIfSandboxCookie, requireAuthenticatedUser } from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { buildInvitationChanges, buildInvitationRevocationChanges } from "@/lib/access-management";
import { rowToInvitation } from "@/lib/db/mappers";
import type { DbInvitation } from "@/lib/db/types";
import type { Invitation } from "@/types";
import { buildStaffValidationErrorResponse, getStaffFieldErrors } from "@/lib/staff-validation";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";

export const dynamic = "force-dynamic";

const invitationRoleSchema = z.enum(["super_admin", "admin", "user"]);

const patchSchema = z.object({
  orgId: z.string().uuid(),
  invitationId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  email: z.string().trim().email().optional(),
  roleToAssign: invitationRoleSchema.optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(50).optional(),
  departmentIds: z.array(z.number().int()).optional(),
  deptAdminIds: z.array(z.number().int()).optional(),
});

const deleteSchema = z.object({
  orgId: z.string().uuid(),
  invitationId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

const resendSchema = z.object({
  action: z.literal("resend"),
  orgId: z.string().uuid(),
  invitationId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

const replaceAccessSchema = z.object({
  action: z.literal("replace_access"),
  orgId: z.string().uuid(),
  invitationId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  roleToAssign: invitationRoleSchema,
});

const postSchema = z.discriminatedUnion("action", [resendSchema, replaceAccessSchema]);

const getSchema = z.object({
  orgId: z.string().uuid(),
});

function timestampsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

async function requirePrivilegedActor(
  req: NextRequest,
  orgId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
  );
  if ("response" in auth) {
    return { ok: false, response: auth.response };
  }

  return { ok: true };
}

async function fetchInvitation(orgId: string, invitationId: string): Promise<Invitation | null> {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("invitations")
    .select(
      "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
    )
    .eq("org_id", orgId)
    .eq("id", invitationId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToInvitation(data as DbInvitation) : null;
}

async function fetchInvitationWithToken(
  orgId: string,
  invitationId: string,
): Promise<{ invitation: Invitation; token: string } | null> {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("invitations")
    .select(
      "id, org_id, invited_by, email, role_to_assign, token, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
    )
    .eq("org_id", orgId)
    .eq("id", invitationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as DbInvitation;
  if (!row.token) throw new Error("Invitation token is missing");
  return { invitation: rowToInvitation(row), token: row.token };
}

/**
 * `one_pending_invite_per_email` is a partial unique index on
 * invitations(org_id, email) WHERE accepted_at IS NULL AND revoked_at IS
 * NULL. Editing a pending invitation's email to one that collides with a
 * different live pending invitation hits this index directly (there's no
 * app-level pre-check, unlike invitation creation's send_invitation RPC
 * guard), so this needs its own friendly mapping.
 */
function isPendingInviteEmailConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    code?: unknown;
    constraint?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (record.code !== "23505") return false;
  const text = [record.constraint, record.details, record.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return text.includes("one_pending_invite_per_email");
}

function buildConflictResponse(latestInvitation: Invitation) {
  return NextResponse.json(
    {
      error: "Invitation changed elsewhere. Review the latest values before saving again.",
      code: "ORG_INVITATION_CONFLICT",
      invitation: latestInvitation,
    },
    { status: 409 },
  );
}

async function writeAuditEntry(input: {
  orgId: string;
  actorId: string;
  actorEmail: string | null;
  resourceId: string;
  action: string;
  changes: ReturnType<typeof buildInvitationChanges>;
  req: NextRequest;
  relatedInvitationId?: string;
}) {
  const serviceClient = getServiceClient();
  const { error } = await serviceClient.from("audit_log").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    actor_email: input.actorEmail,
    action: input.action,
    resource_type: "invitation",
    resource_id: input.resourceId,
    details: {
      changedFields: input.changes.map((change) => change.key),
      changes: input.changes.map((change) => ({
        field: change.key,
        label: change.label,
        from: change.previousValue,
        to: change.nextValue,
      })),
      ...(input.relatedInvitationId ? { replacementInvitationId: input.relatedInvitationId } : {}),
    },
    ip_address: getRequestIp(input.req),
    user_agent: input.req.headers.get("user-agent"),
  });

  if (error) {
    logger.error(
      { error, orgId: input.orgId, resourceId: input.resourceId },
      "Invitation audit log write failed",
    );
  }
}

async function checkInvitationEmailLimit(email: string) {
  return checkRateLimit(emailTargetLimiter, `invite-email:${hashEmail(email)}`);
}

async function sendPendingInvitationEmail(input: {
  orgId: string;
  token: string;
  email: string;
  inviterName: string | null;
}) {
  const config = getInvitationEmailConfig();
  if (!config) {
    throw new Error("Email service not configured");
  }

  const serviceClient = getServiceClient();
  const { data: organization, error } = await serviceClient
    .from("organizations")
    .select("name")
    .eq("id", input.orgId)
    .maybeSingle();
  if (error) throw error;

  await sendInvitationEmail({
    config,
    token: input.token,
    email: input.email,
    orgName: (organization?.name as string | null) || "your organization",
    inviterName: input.inviterName,
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  const parsed = getSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  // Sandbox: redirect the read to the sandbox org so sandbox callers
  // don't see the real organization's pending invitations.
  const effectiveOrgId = await resolveEffectiveOrgId(req, auth.user.id, parsed.data.orgId);

  try {
    const allowed = await requirePrivilegedActor(req, effectiveOrgId);
    if (!allowed.ok) return allowed.response;

    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient
      .from("invitations")
      .select(
        "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
      )
      .eq("org_id", effectiveOrgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      invitations: (data ?? []).map((row) => rowToInvitation(row as DbInvitation)),
    });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "organizations/invitations:get", orgId: effectiveOrgId },
    });
    logger.error({ error: err, orgId: effectiveOrgId }, "Invitation fetch failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const { orgId, invitationId, expectedUpdatedAt, ...fields } = parsed.data;
  const fieldErrors = getStaffFieldErrors({
    ...(fields.email !== undefined ? { optionalEmail: fields.email } : {}),
    ...(fields.firstName !== undefined ? { firstName: fields.firstName } : {}),
    ...(fields.lastName !== undefined ? { lastName: fields.lastName } : {}),
    ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
  });
  if (Object.keys(fieldErrors).length > 0) {
    return buildStaffValidationErrorResponse(fieldErrors);
  }

  try {
    const allowed = await requirePrivilegedActor(req, orgId);
    if (!allowed.ok) return allowed.response;

    const currentInvitation = await fetchInvitation(orgId, invitationId);
    if (!currentInvitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (currentInvitation.revokedAt || currentInvitation.acceptedAt) {
      return NextResponse.json(
        { error: "This invitation is no longer pending. It was revoked or already accepted." },
        { status: 409 },
      );
    }

    if (!timestampsMatch(currentInvitation.updatedAt, expectedUpdatedAt)) {
      return buildConflictResponse(currentInvitation);
    }

    const nextInvitation: Partial<Invitation> = {
      email:
        fields.email !== undefined
          ? normalizeOptionalStaffEmail(fields.email) || undefined
          : undefined,
      roleToAssign: fields.roleToAssign,
      firstName:
        fields.firstName !== undefined
          ? fields.firstName.trim()
            ? normalizeStaffName(fields.firstName)
            : ""
          : undefined,
      lastName:
        fields.lastName !== undefined
          ? fields.lastName.trim()
            ? normalizeStaffName(fields.lastName)
            : ""
          : undefined,
      phone: fields.phone !== undefined ? normalizeOptionalUsPhone(fields.phone) : undefined,
      departmentIds: fields.departmentIds,
      deptAdminIds: fields.deptAdminIds,
    };

    const changes = buildInvitationChanges(currentInvitation, nextInvitation);
    if (changes.length === 0) {
      return NextResponse.json({ success: true, invitation: currentInvitation });
    }

    const deptSet = new Set(fields.departmentIds ?? currentInvitation.departmentIds ?? []);
    const nextDeptAdminIds =
      fields.deptAdminIds !== undefined
        ? fields.deptAdminIds.filter((id) => deptSet.has(id))
        : (currentInvitation.deptAdminIds ?? []);

    const serviceClient = getServiceClient();
    const { data: updatedInvitation, error } = await serviceClient
      .from("invitations")
      .update({
        email: fields.email?.toLowerCase() ?? currentInvitation.email,
        role_to_assign: fields.roleToAssign ?? currentInvitation.roleToAssign,
        first_name: fields.firstName ?? currentInvitation.firstName ?? null,
        last_name: fields.lastName ?? currentInvitation.lastName ?? null,
        phone: fields.phone ?? currentInvitation.phone ?? null,
        department_ids: fields.departmentIds ?? currentInvitation.departmentIds ?? [],
        dept_admin_ids: nextDeptAdminIds,
      })
      .eq("org_id", orgId)
      .eq("id", invitationId)
      .eq("updated_at", expectedUpdatedAt)
      .select(
        "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
      )
      .maybeSingle();

    if (error) {
      if (isPendingInviteEmailConflict(error)) {
        return NextResponse.json(
          {
            error:
              "That email address already has a separate pending invitation. Revoke it first, or use a different email.",
          },
          { status: 409 },
        );
      }
      throw error;
    }

    if (!updatedInvitation) {
      const latestInvitation = await fetchInvitation(orgId, invitationId);
      if (latestInvitation) return buildConflictResponse(latestInvitation);
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const latestInvitation = rowToInvitation(updatedInvitation as DbInvitation);

    await writeAuditEntry({
      orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      resourceId: invitationId,
      action: "invitation.updated",
      changes,
      req,
    });

    return NextResponse.json({ success: true, invitation: latestInvitation });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "organizations/invitations", orgId, invitationId },
    });
    logger.error({ error: err, orgId, invitationId }, "Invitation update failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const { orgId, invitationId, expectedUpdatedAt } = parsed.data;

  try {
    const allowed = await requirePrivilegedActor(req, orgId);
    if (!allowed.ok) return allowed.response;

    const currentInvitation = await fetchInvitation(orgId, invitationId);
    if (!currentInvitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (!timestampsMatch(currentInvitation.updatedAt, expectedUpdatedAt)) {
      return buildConflictResponse(currentInvitation);
    }

    const serviceClient = getServiceClient();
    const { data: updatedInvitation, error } = await serviceClient
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", invitationId)
      .eq("updated_at", expectedUpdatedAt)
      .select(
        "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
      )
      .maybeSingle();

    if (error) throw error;

    if (!updatedInvitation) {
      const latestInvitation = await fetchInvitation(orgId, invitationId);
      if (latestInvitation) return buildConflictResponse(latestInvitation);
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const latestInvitation = rowToInvitation(updatedInvitation as DbInvitation);

    await writeAuditEntry({
      orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      resourceId: invitationId,
      action: "invitation.revoked",
      changes: buildInvitationRevocationChanges(),
      req,
    });

    void dispatchNotificationEvent(user.id, {
      action: "invitation_revoked",
      orgId,
      invitationId,
      inviteeEmail: latestInvitation.email,
    });

    return NextResponse.json({ success: true, invitation: latestInvitation });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "organizations/invitations", orgId, invitationId },
    });
    logger.error({ error: err, orgId, invitationId }, "Invitation revocation failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
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

  const { orgId, invitationId, expectedUpdatedAt } = parsed.data;

  try {
    const allowed = await requirePrivilegedActor(req, orgId);
    if (!allowed.ok) return allowed.response;

    const currentSnapshot = await fetchInvitationWithToken(orgId, invitationId);
    if (!currentSnapshot) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    const { invitation: currentInvitation, token: previousToken } = currentSnapshot;

    if (!timestampsMatch(currentInvitation.updatedAt, expectedUpdatedAt)) {
      return buildConflictResponse(currentInvitation);
    }

    const serviceClient = getServiceClient();

    const targetLimit = await checkInvitationEmailLimit(currentInvitation.email);
    if (targetLimit.misconfigured) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (targetLimit.limited) {
      const retryAfter = targetLimit.reset
        ? Math.ceil((targetLimit.reset - Date.now()) / 1000)
        : 60;
      return NextResponse.json(
        {
          error:
            "We've sent several invites to that address already. Wait a few minutes and try again.",
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    if (parsed.data.action === "replace_access") {
      if (
        currentInvitation.revokedAt ||
        currentInvitation.acceptedAt ||
        new Date(currentInvitation.expiresAt).getTime() < Date.now()
      ) {
        return NextResponse.json(
          { error: "This invitation is no longer pending. Refresh and try again." },
          { status: 409 },
        );
      }

      if (currentInvitation.roleToAssign === parsed.data.roleToAssign) {
        return NextResponse.json({ success: true, invitation: currentInvitation });
      }

      const { data: replacementData, error: replacementError } = await serviceClient.rpc(
        "replace_pending_invitation_access",
        {
          p_org_id: orgId,
          p_invitation_id: invitationId,
          p_expected_updated_at: expectedUpdatedAt,
          p_role: parsed.data.roleToAssign,
          p_invited_by: user.id,
        },
      );
      if (replacementError) {
        const message = String(replacementError.message ?? "").toLowerCase();
        if (message.includes("changed elsewhere")) {
          const latestInvitation = await fetchInvitation(orgId, invitationId);
          if (latestInvitation) return buildConflictResponse(latestInvitation);
        }
        if (message.includes("no longer pending")) {
          return NextResponse.json(
            { error: "This invitation is no longer pending. Refresh and try again." },
            { status: 409 },
          );
        }
        if (message.includes("not found")) {
          return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
        }
        throw replacementError;
      }

      const replacement = replacementData as {
        previous_invitation_id?: string;
        invitation_id?: string;
        token?: string;
        expires_at?: string;
      } | null;
      if (
        !replacement?.previous_invitation_id ||
        !replacement.invitation_id ||
        !replacement.token ||
        !replacement.expires_at
      ) {
        throw new Error("Invitation replacement did not return complete data.");
      }

      const replacementInvitation = await fetchInvitation(orgId, replacement.invitation_id);
      if (!replacementInvitation) {
        throw new Error("Replacement invitation could not be loaded.");
      }

      try {
        await sendPendingInvitationEmail({
          orgId,
          token: replacement.token,
          email: replacementInvitation.email,
          inviterName: user.email ?? null,
        });
      } catch (emailError) {
        const { data: rolledBack, error: rollbackError } = await serviceClient.rpc(
          "rollback_pending_invitation_access_replacement",
          {
            p_org_id: orgId,
            p_previous_invitation_id: replacement.previous_invitation_id,
            p_replacement_invitation_id: replacement.invitation_id,
          },
        );
        if (rollbackError || rolledBack !== true) {
          logger.error(
            {
              error: rollbackError,
              orgId,
              invitationId,
              replacementInvitationId: replacement.invitation_id,
            },
            "Failed to roll back invitation access replacement after email failure",
          );
        }
        Sentry.captureException(emailError, {
          extra: { context: "invitation-access-replacement-email", orgId, invitationId },
        });
        return NextResponse.json(
          {
            error:
              emailError instanceof Error && emailError.message === "Email service not configured"
                ? "Email service not configured"
                : "We couldn't send the replacement invitation. The original invitation is still active.",
          },
          {
            status:
              emailError instanceof Error && emailError.message === "Email service not configured"
                ? 503
                : 502,
          },
        );
      }

      await writeAuditEntry({
        orgId,
        actorId: user.id,
        actorEmail: user.email ?? null,
        resourceId: invitationId,
        action: "invitation.access_replaced",
        changes: buildInvitationChanges(currentInvitation, {
          roleToAssign: parsed.data.roleToAssign,
        }),
        relatedInvitationId: replacement.invitation_id,
        req,
      });

      void dispatchNotificationEvent(user.id, {
        action: "invitation_revoked",
        orgId,
        invitationId,
        inviteeEmail: currentInvitation.email,
      });
      void dispatchNotificationEvent(user.id, {
        action: "invitation_created",
        orgId,
        invitationId: replacement.invitation_id,
        inviteeEmail: replacementInvitation.email,
      });

      return NextResponse.json({
        success: true,
        previousInvitationId: replacement.previous_invitation_id,
        invitation: replacementInvitation,
        token: replacement.token,
        expiresAt: replacement.expires_at,
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: updatedInvitation, error } = await serviceClient
      .from("invitations")
      .update({
        token,
        expires_at: expiresAt,
        revoked_at: null,
      })
      .eq("org_id", orgId)
      .eq("id", invitationId)
      .eq("updated_at", expectedUpdatedAt)
      .is("accepted_at", null)
      .select(
        "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
      )
      .maybeSingle();

    if (error) throw error;

    if (!updatedInvitation) {
      const latestInvitation = await fetchInvitation(orgId, invitationId);
      if (latestInvitation) return buildConflictResponse(latestInvitation);
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const latestInvitation = rowToInvitation(updatedInvitation as DbInvitation);

    try {
      await sendPendingInvitationEmail({
        orgId,
        token,
        email: latestInvitation.email,
        inviterName: user.email ?? null,
      });
    } catch (emailError) {
      const { data: restoredInvitation, error: rollbackError } = await serviceClient
        .from("invitations")
        .update({
          token: previousToken,
          expires_at: currentInvitation.expiresAt,
          revoked_at: currentInvitation.revokedAt,
        })
        .eq("org_id", orgId)
        .eq("id", invitationId)
        .eq("updated_at", latestInvitation.updatedAt)
        .eq("token", token)
        .is("accepted_at", null)
        .select("id")
        .maybeSingle();
      if (rollbackError || !restoredInvitation) {
        logger.error(
          { error: rollbackError, orgId, invitationId },
          "Failed to restore invitation after resend email failure",
        );
      }
      Sentry.captureException(emailError, {
        extra: { context: "invitation-resend-email", orgId, invitationId },
      });
      return NextResponse.json(
        {
          error:
            emailError instanceof Error && emailError.message === "Email service not configured"
              ? "Email service not configured"
              : "We couldn't send that invitation email. Try again.",
        },
        {
          status:
            emailError instanceof Error && emailError.message === "Email service not configured"
              ? 503
              : 502,
        },
      );
    }

    await writeAuditEntry({
      orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      resourceId: invitationId,
      action: "invitation.resent",
      changes: [
        {
          key: "expiresAt",
          label: "Expiry",
          previousValue: currentInvitation.expiresAt,
          nextValue: expiresAt,
          previousDisplay: currentInvitation.expiresAt,
          nextDisplay: expiresAt,
          sensitive: false,
        },
      ],
      req,
    });

    void dispatchNotificationEvent(user.id, {
      action: "invitation_resent",
      orgId,
      invitationId,
      inviteeEmail: latestInvitation.email,
    });

    return NextResponse.json({
      success: true,
      invitation: latestInvitation,
      token,
      expiresAt,
    });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "organizations/invitations", orgId, invitationId },
    });
    logger.error({ error: err, orgId, invitationId }, "Invitation resend failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
