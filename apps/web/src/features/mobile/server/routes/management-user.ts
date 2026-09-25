import { NextResponse, type NextRequest } from "next/server";
import {
  mobileManagementUserRemoveBodySchema,
  mobileManagementUserResponseSchema,
  mobileManagementUserUpdateBodySchema,
} from "@dubgrid/contracts";
import {
  insertMobileAuditLogEntry,
  replaceMobilePendingInvitationAccessRow,
  revokeMobileEmployeeInvitationRow,
  rollbackMobilePendingInvitationAccessReplacement,
  updateMobileInvitationAssignmentsRow,
  updateMobileMembershipAccessRow,
} from "@dubgrid/data-access";
import { SELF_ACTION_FORBIDDEN_CODE, SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import {
  findInvalidManagementDepartmentIds,
  findManagementUser,
  getRequestIp,
  managementConflictResponse,
  requireManagementRosterActor,
} from "@/features/mobile/server/management-roster";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function requireRosterMember(req: NextRequest, personId: string) {
  const gated = await requireManagementRosterActor(req);
  if ("response" in gated) return gated;
  const { auth } = gated;

  const managementUser = await findManagementUser(auth.serviceClient, auth.currentOrg.id, personId);
  if (!managementUser) {
    return { response: NextResponse.json({ error: "Management user not found" }, { status: 404 }) };
  }
  if (managementUser.userId && managementUser.userId === auth.user.id) {
    return {
      response: NextResponse.json(
        { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
        { status: 403 },
      ),
    };
  }

  return { auth, managementUser };
}

export async function PUT(req: NextRequest, context: { params: Promise<{ personId: string }> }) {
  const { personId } = await context.params;
  const gated = await requireRosterMember(req, personId);
  if ("response" in gated) return gated.response;
  const { auth, managementUser } = gated;

  const parsed = mobileManagementUserUpdateBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the management access details and try again." },
      { status: 400 },
    );
  }

  const departmentIds = [...new Set(parsed.data.managementDepartmentIds)];
  const invalidIds = await findInvalidManagementDepartmentIds(
    auth.serviceClient,
    auth.currentOrg.id,
    departmentIds,
  );
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: "Select management departments from this organization." },
      { status: 400 },
    );
  }

  if (managementUser.updatedAt !== parsed.data.expectedUpdatedAt) {
    return managementConflictResponse();
  }

  const keptDeptAdminIds = managementUser.managementDeptAdminIds.filter((id) =>
    departmentIds.includes(id),
  );

  let rotation: {
    invitationId: string;
    rotatedToken: string;
    previousToken: string;
    previousExpiresAt: string;
  } | null = null;

  if (managementUser.source === "member" && managementUser.userId) {
    const updated = await updateMobileMembershipAccessRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      userId: managementUser.userId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      orgRole: parsed.data.orgRole,
      departmentIds,
      deptAdminIds: keptDeptAdminIds,
    });
    if (!updated) return managementConflictResponse();
  } else if (managementUser.invitationId) {
    if (managementUser.orgRole !== parsed.data.orgRole) {
      const emailConfig = getInvitationEmailConfig();
      if (!emailConfig) return createInvitationEmailUnavailableResponse();

      const replacement = await replaceMobilePendingInvitationAccessRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: managementUser.invitationId,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        roleToAssign: parsed.data.orgRole,
        invitedBy: auth.user.id,
        departmentIds,
        deptAdminIds: keptDeptAdminIds,
      });
      rotation = { invitationId: replacement.invitation.id, ...replacement.rotation };

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
        await rollbackMobilePendingInvitationAccessReplacement(auth.serviceClient, {
          orgId: auth.currentOrg.id,
          invitationId: replacement.invitation.id,
          ...replacement.rotation,
        }).catch((rollbackError) => {
          logger.error(
            { err: rollbackError, personId, invitationId: replacement.invitation.id },
            "Failed to roll back management-roster invitation replacement",
          );
        });
        logger.error(
          { err: error, personId, invitationId: replacement.invitation.id },
          "Failed to send replacement management invitation",
        );
        return NextResponse.json(
          {
            error:
              "We couldn't send the replacement invitation. The original invitation is still active.",
          },
          { status: 502 },
        );
      }
    } else {
      const updated = await updateMobileInvitationAssignmentsRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: managementUser.invitationId,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        roleToAssign: parsed.data.orgRole,
        departmentIds,
        deptAdminIds: keptDeptAdminIds,
      });
      if (!updated) return managementConflictResponse();
    }
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action:
      managementUser.source === "member"
        ? "membership.updated"
        : rotation
          ? "invitation.access_replaced"
          : "invitation.updated",
    resource_type: managementUser.source === "member" ? "organization_membership" : "invitation",
    resource_id: managementUser.userId ?? managementUser.invitationId ?? personId,
    details: {
      changedFields: ["orgRole", "departmentIds"],
      orgRole: parsed.data.orgRole,
      departmentIds,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const latest = await findManagementUser(auth.serviceClient, auth.currentOrg.id, personId);
  return NextResponse.json(
    mobileManagementUserResponseSchema.parse({
      success: true,
      result: managementUser.source === "member" ? "membership_updated" : "invitation_sent",
      managementUser: latest,
    }),
  );
}

/**
 * Take someone off the roster. For a member that clears their management
 * departments and leaves the account alone; for a pending invitation it revokes
 * the invitation outright, since a management-only invite has nothing left
 * behind it once its departments are gone.
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ personId: string }> }) {
  const { personId } = await context.params;
  const gated = await requireRosterMember(req, personId);
  if ("response" in gated) return gated.response;
  const { auth, managementUser } = gated;

  const parsed = mobileManagementUserRemoveBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the request and try again." }, { status: 400 });
  }
  if (managementUser.updatedAt !== parsed.data.expectedUpdatedAt) {
    return managementConflictResponse();
  }

  if (managementUser.source === "member" && managementUser.userId) {
    const updated = await updateMobileMembershipAccessRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      userId: managementUser.userId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      departmentIds: [],
      deptAdminIds: [],
    });
    if (!updated) return managementConflictResponse();
  } else if (managementUser.invitationId) {
    const revoked = await revokeMobileEmployeeInvitationRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      invitationId: managementUser.invitationId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    if (!revoked) return managementConflictResponse();
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: managementUser.source === "member" ? "membership.updated" : "invitation.revoked",
    resource_type: managementUser.source === "member" ? "organization_membership" : "invitation",
    resource_id: managementUser.userId ?? managementUser.invitationId ?? personId,
    details: {
      changedFields: ["departmentIds"],
      departmentIds: [],
      managementAccessRemoved: true,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  return NextResponse.json(
    mobileManagementUserResponseSchema.parse({
      success: true,
      result: "access_removed",
      managementUser: null,
    }),
  );
}
