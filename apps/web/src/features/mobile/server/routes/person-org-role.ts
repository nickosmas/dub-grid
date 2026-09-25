import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonOrgRoleBodySchema,
  mobilePersonOrgRoleResponseSchema,
} from "@dubgrid/contracts";
import {
  changeMobileMembershipOrgRole,
  insertMobileAuditLogEntry,
  replaceMobilePendingInvitationAccessRow,
  rollbackMobilePendingInvitationAccessReplacement,
} from "@dubgrid/data-access";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";
import { requireManagementAccessActor } from "@/features/mobile/server/management-access-actor";
import {
  loadMobilePersonWithAccess,
  type LoadedMobilePerson,
} from "@/features/mobile/server/person-access";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

function conflictResponse(person: LoadedMobilePerson["person"]) {
  return NextResponse.json(
    {
      error: "Access changed elsewhere. Review the latest values and try again.",
      code: "ORG_ACCESS_CONFLICT",
      person,
    },
    { status: 409 },
  );
}

/**
 * The org role on its own, which is what the People screen's access badge
 * writes. Management departments deliberately travel a different route: someone
 * can be an Admin without managing a department, and web has always let the two
 * be set independently.
 *
 * Which write happens follows from whether the person has an account. A member's
 * role lives on their membership; an invited person's lives on the invitation,
 * where changing it means revoking and reissuing, exactly as web's Access column
 * does.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gated = await requireManagementAccessActor(req, id);
  if ("response" in gated) return gated.response;
  const { auth, loaded } = gated;

  const parsed = mobilePersonOrgRoleBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the access details and try again." }, { status: 400 });
  }
  const { orgRole } = parsed.data;

  // ── Already has an account: their membership carries the role ──
  if (loaded.userId) {
    if (!loaded.membership) {
      return NextResponse.json(
        { error: "That teammate's account is no longer a member of this organization." },
        { status: 404 },
      );
    }
    if ((loaded.membership.updated_at ?? null) !== parsed.data.expectedMembershipUpdatedAt) {
      return conflictResponse(loaded.person);
    }
    if (loaded.membership.org_role === orgRole) {
      return NextResponse.json(
        mobilePersonOrgRoleResponseSchema.parse({
          success: true,
          result: "unchanged",
          person: loaded.person,
        }),
      );
    }

    // Through the RPC, not a direct column write: `guard_org_role_change`
    // rejects the latter outright. It touches only `org_role`, so this person's
    // management departments are untouched by construction.
    const outcome = await changeMobileMembershipOrgRole(auth.userClient, {
      orgId: auth.currentOrg.id,
      targetUserId: loaded.userId,
      actorUserId: auth.user.id,
      orgRole,
      expectedUpdatedAt: parsed.data.expectedMembershipUpdatedAt,
    });
    if (outcome.status === "conflict") {
      const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
      return conflictResponse(latest?.person ?? loaded.person);
    }
    if (outcome.status === "blocked") {
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    }

    void dispatchNotificationEvent(auth.user.id, {
      action: "role_changed",
      orgId: auth.currentOrg.id,
      targetUserId: loaded.userId,
      fromRole: loaded.membership.org_role ?? "user",
      toRole: orgRole,
    });

    await insertMobileAuditLogEntry(auth.serviceClient, {
      org_id: auth.currentOrg.id,
      actor_id: auth.user.id,
      actor_email: auth.user.email ?? null,
      action: "membership.updated",
      resource_type: "organization_membership",
      resource_id: loaded.userId,
      details: {
        changedFields: ["orgRole"],
        employeeId: id,
        fromRole: loaded.membership.org_role ?? "user",
        orgRole,
      },
      ip_address: getRequestIp(req),
      user_agent: req.headers?.get("user-agent") ?? null,
    });

    const person = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
    return NextResponse.json(
      mobilePersonOrgRoleResponseSchema.parse({
        success: true,
        result: "membership_updated",
        person: person?.person ?? loaded.person,
      }),
    );
  }

  // ── No account yet: the role lives on the invitation ──
  if (!loaded.pendingInvitation) {
    return NextResponse.json(
      { error: "Send an invitation before changing app access." },
      { status: 400 },
    );
  }
  if ((loaded.pendingInvitation.updated_at ?? null) !== parsed.data.expectedInvitationUpdatedAt) {
    return conflictResponse(loaded.person);
  }
  if (loaded.pendingInvitation.role_to_assign === orgRole) {
    return NextResponse.json(
      mobilePersonOrgRoleResponseSchema.parse({
        success: true,
        result: "unchanged",
        person: loaded.person,
      }),
    );
  }

  const emailConfig = getInvitationEmailConfig();
  if (!emailConfig) {
    return createInvitationEmailUnavailableResponse();
  }

  // Changing the role rotates the same invitation to a new token, so the
  // earlier link stops working. Departments come across untouched for the same
  // reason they do on the membership branch.
  const replacement = await replaceMobilePendingInvitationAccessRow(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    invitationId: loaded.pendingInvitation.id,
    expectedUpdatedAt: parsed.data.expectedInvitationUpdatedAt,
    roleToAssign: orgRole,
    invitedBy: auth.user.id,
    departmentIds: loaded.pendingInvitation.department_ids ?? [],
    deptAdminIds: loaded.pendingInvitation.dept_admin_ids ?? [],
  });

  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: replacement.invitation.token,
      email: replacement.invitation.email,
      orgName: auth.currentOrg.name || "your organization",
      expiresAt: replacement.invitation.expires_at,
      timeZone: auth.currentOrg.timezone ?? null,
      kind: "reissue",
    });
  } catch (error) {
    logger.error(
      { err: error, employeeId: id, invitationId: replacement.invitation.id },
      "Failed to send mobile role-change invitation email",
    );
    await rollbackMobilePendingInvitationAccessReplacement(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      invitationId: replacement.invitation.id,
      ...replacement.rotation,
    }).catch((rollbackError) => {
      logger.error(
        { err: rollbackError, employeeId: id, invitationId: replacement.invitation.id },
        "Failed to roll back mobile role-change invitation replacement after email failure",
      );
    });
    return NextResponse.json(
      { error: "We couldn't send that invitation email. Try again in a moment." },
      { status: 502 },
    );
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "invitation.access_replaced",
    resource_type: "invitation",
    resource_id: replacement.invitation.id,
    details: {
      changedFields: ["roleToAssign"],
      email: replacement.invitation.email,
      employeeId: id,
      fromRole: loaded.pendingInvitation.role_to_assign ?? "user",
      roleToAssign: orgRole,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonOrgRoleResponseSchema.parse({
      success: true,
      result: "invitation_replaced",
      person: person?.person ?? loaded.person,
    }),
  );
}
