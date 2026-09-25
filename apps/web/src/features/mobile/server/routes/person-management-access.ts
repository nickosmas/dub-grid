import { NextResponse, type NextRequest } from "next/server";
import {
  mobileManagementAccessBodySchema,
  mobileManagementAccessRemoveBodySchema,
  mobileManagementAccessResponseSchema,
} from "@dubgrid/contracts";
import {
  changeMobileMembershipOrgRole,
  createMobileEmployeeInvitationRow,
  fetchMobileDepartmentRows,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  restoreMobileEmployeeInvitationRow,
  replaceMobilePendingInvitationAccessRow,
  rollbackMobilePendingInvitationAccessReplacement,
  revokeMobileEmployeeInvitationRow,
  updateMobileInvitationAssignmentsRow,
  updateMobileMembershipAccessRow,
  type MobileInvitationRotation,
} from "@dubgrid/data-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";
import {
  requireManagementAccessActor,
  selfActionForbiddenResponse,
} from "@/features/mobile/server/management-access-actor";
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
      error: "Management access changed elsewhere. Review the latest values and try again.",
      code: "ORG_ACCESS_CONFLICT",
      person,
    },
    { status: 409 },
  );
}

/**
 * Departments the client asked for must all exist in this org *and* be
 * management departments. The generic staff validator only checks the first
 * half, which would let a scheduled department id through and quietly grant
 * management access keyed to a department that can never appear in the roster.
 */
async function findInvalidManagementDepartmentIds(
  serviceClient: SupabaseClient,
  orgId: string,
  departmentIds: number[],
): Promise<number[]> {
  const rows = await fetchMobileDepartmentRows(serviceClient, orgId);
  const managementIds = new Set(
    rows.filter((row) => row.type === "management").map((row) => row.id),
  );
  return departmentIds.filter((id) => !managementIds.has(id));
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gated = await requireManagementAccessActor(req, id, { allowSelf: true });
  if ("response" in gated) return gated.response;
  const { auth, loaded, isSelf } = gated;

  const parsed = mobileManagementAccessBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the management access details and try again." },
      { status: 400 },
    );
  }

  // Your own departments, yes; your own role, never. The role RPC refuses a
  // self change as well, but refusing it here keeps the departments write from
  // going ahead on a request that asked for both.
  if (isSelf && loaded.membership && loaded.membership.org_role !== parsed.data.orgRole) {
    return selfActionForbiddenResponse();
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

  // ── Already has an account: their membership is the source of truth ──
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

    // Two writes, because the database allows only one path to `org_role`: a
    // direct column write is rejected by `guard_org_role_change`. The role goes
    // through the RPC first, and the departments through the row update after.
    if (loaded.membership.org_role !== parsed.data.orgRole) {
      const outcome = await changeMobileMembershipOrgRole(auth.userClient, {
        orgId: auth.currentOrg.id,
        targetUserId: loaded.userId,
        actorUserId: auth.user.id,
        orgRole: parsed.data.orgRole,
        expectedUpdatedAt: parsed.data.expectedMembershipUpdatedAt,
      });
      if (outcome.status === "conflict") {
        const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
        return conflictResponse(latest?.person ?? loaded.person);
      }
      if (outcome.status === "blocked") {
        return NextResponse.json({ error: outcome.message }, { status: 400 });
      }
    }

    // The RPC bumps the membership's `updated_at`, so the guard this write
    // carries has to be re-read rather than reusing the caller's.
    const latestMembership = await loadMobilePersonWithAccess(
      auth.serviceClient,
      auth.currentOrg.id,
      id,
    );
    const updated = await updateMobileMembershipAccessRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      userId: loaded.userId,
      expectedUpdatedAt: latestMembership?.membership?.updated_at ?? null,
      departmentIds,
      // Department-admin grants only make sense inside departments the person
      // is actually in, so dropping a department drops its admin grant too.
      deptAdminIds: (loaded.membership.dept_admin_ids ?? []).filter((deptId) =>
        departmentIds.includes(deptId),
      ),
    });
    if (!updated) {
      const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
      return conflictResponse(latest?.person ?? loaded.person);
    }

    // A membership supersedes any invitation that was still outstanding.
    if (loaded.pendingInvitation) {
      await revokeMobileEmployeeInvitationRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: loaded.pendingInvitation.id,
        expectedUpdatedAt: loaded.pendingInvitation.updated_at ?? null,
      });
    }

    await insertMobileAuditLogEntry(auth.serviceClient, {
      org_id: auth.currentOrg.id,
      actor_id: auth.user.id,
      actor_email: auth.user.email ?? null,
      action: "membership.updated",
      resource_type: "organization_membership",
      resource_id: loaded.userId,
      details: {
        changedFields: ["orgRole", "departmentIds"],
        employeeId: id,
        orgRole: parsed.data.orgRole,
        departmentIds,
      },
      ip_address: getRequestIp(req),
      user_agent: req.headers?.get("user-agent") ?? null,
    });

    const person = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
    return NextResponse.json(
      mobileManagementAccessResponseSchema.parse({
        success: true,
        result: "membership_updated",
        person: person?.person ?? loaded.person,
      }),
    );
  }

  // ── No account yet: the invitation carries the role and the departments ──
  const email = (parsed.data.email ?? loaded.person.email ?? "").trim();
  if (!email) {
    return NextResponse.json(
      { error: "Add an email address for this teammate before granting management access." },
      { status: 400 },
    );
  }

  const emailConfig = getInvitationEmailConfig();
  if (!emailConfig) {
    return createInvitationEmailUnavailableResponse();
  }

  let invitation;
  let createdInvitation = false;
  let rotation: ({ invitationId: string } & MobileInvitationRotation) | null = null;
  let refreshed: {
    invitationId: string;
    rotatedToken: string;
    previousToken: string;
    previousExpiresAt: string;
    previousDepartmentIds: number[];
    previousDeptAdminIds: number[];
  } | null = null;
  if (loaded.pendingInvitation) {
    if ((loaded.pendingInvitation.updated_at ?? null) !== parsed.data.expectedInvitationUpdatedAt) {
      return conflictResponse(loaded.person);
    }

    if (loaded.pendingInvitation.role_to_assign !== parsed.data.orgRole) {
      const replacement = await replaceMobilePendingInvitationAccessRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: loaded.pendingInvitation.id,
        expectedUpdatedAt: parsed.data.expectedInvitationUpdatedAt,
        roleToAssign: parsed.data.orgRole,
        invitedBy: auth.user.id,
        departmentIds,
        deptAdminIds: (loaded.pendingInvitation.dept_admin_ids ?? []).filter((deptId) =>
          departmentIds.includes(deptId),
        ),
      });
      invitation = replacement.invitation;
      rotation = { invitationId: replacement.invitation.id, ...replacement.rotation };
    } else {
      const reassigned = await updateMobileInvitationAssignmentsRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: loaded.pendingInvitation.id,
        expectedUpdatedAt: parsed.data.expectedInvitationUpdatedAt,
        roleToAssign: parsed.data.orgRole,
        departmentIds,
        deptAdminIds: (loaded.pendingInvitation.dept_admin_ids ?? []).filter((deptId) =>
          departmentIds.includes(deptId),
        ),
      });
      if (!reassigned) {
        const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
        return conflictResponse(latest?.person ?? loaded.person);
      }

      // A fresh token and expiry, so the emailed link is the one that works.
      const refresh = await refreshMobileEmployeeInvitationRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: reassigned.id,
        expectedUpdatedAt: reassigned.updated_at ?? null,
      });
      if (!refresh) {
        const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
        return conflictResponse(latest?.person ?? loaded.person);
      }
      invitation = refresh.invitation;
      // A failed send puts the link and the departments back as they were,
      // so the old link never carries access the admin was told failed.
      refreshed = {
        invitationId: refresh.invitation.id,
        rotatedToken: refresh.invitation.token,
        previousToken: refresh.previousToken,
        previousExpiresAt: refresh.previousExpiresAt,
        previousDepartmentIds: loaded.pendingInvitation.department_ids ?? [],
        previousDeptAdminIds: loaded.pendingInvitation.dept_admin_ids ?? [],
      };
    }
  } else {
    invitation = await createMobileEmployeeInvitationRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      employeeId: id,
      invitedBy: auth.user.id,
      email,
      roleToAssign: parsed.data.orgRole,
      firstName: loaded.person.firstName,
      lastName: loaded.person.lastName,
      phone: loaded.person.phone || null,
      departmentIds,
      deptAdminIds: [],
    });
    createdInvitation = true;
  }

  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: invitation.token,
      email: invitation.email,
      orgName: auth.currentOrg.name || "your organization",
      expiresAt: invitation.expires_at,
      timeZone: auth.currentOrg.timezone ?? null,
      kind: createdInvitation ? "new" : "reissue",
    });
  } catch (error) {
    logger.error(
      { err: error, employeeId: id, invitationId: invitation.id },
      "Failed to send mobile management invitation email",
    );
    // Whatever this request changed is undone: a new row is revoked, and an
    // invitation that already existed gets its previous link and access back
    // rather than being revoked, which would take away access the failed email
    // never had anything to do with.
    if (rotation) {
      await rollbackMobilePendingInvitationAccessReplacement(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        ...rotation,
      }).catch((rollbackError) => {
        logger.error(
          { err: rollbackError, employeeId: id, invitationId: rotation.invitationId },
          "Failed to roll back mobile invitation access replacement after email failure",
        );
      });
    } else if (refreshed) {
      const restore = refreshed;
      await restoreMobileEmployeeInvitationRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        ...restore,
      }).catch((restoreError) => {
        logger.error(
          { err: restoreError, employeeId: id, invitationId: restore.invitationId },
          "Failed to restore mobile management invitation after email failure",
        );
      });
    } else if (createdInvitation) {
      await revokeMobileEmployeeInvitationRow(auth.serviceClient, {
        orgId: auth.currentOrg.id,
        invitationId: invitation.id,
        expectedUpdatedAt: invitation.updated_at ?? null,
      }).catch((revokeError) => {
        logger.error(
          { err: revokeError, employeeId: id, invitationId: invitation.id },
          "Failed to revoke mobile management invitation after email failure",
        );
      });
    }
    return NextResponse.json(
      { error: "We couldn't send that invitation email. Try again in a moment." },
      { status: 502 },
    );
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: createdInvitation
      ? "invitation.created"
      : rotation
        ? "invitation.access_replaced"
        : "invitation.updated",
    resource_type: "invitation",
    resource_id: invitation.id,
    details: {
      changedFields: ["email", "employeeId", "roleToAssign", "departmentIds"],
      email: invitation.email,
      employeeId: id,
      roleToAssign: parsed.data.orgRole,
      departmentIds,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
  return NextResponse.json(
    mobileManagementAccessResponseSchema.parse({
      success: true,
      result: "invitation_sent",
      person: person?.person ?? loaded.person,
    }),
  );
}

/**
 * Take someone off the management roster without touching their staff profile:
 * their management departments are cleared and any invitation that was only
 * ever a management invitation is revoked. Their org role is deliberately left
 * alone — role changes go through PUT, where they are visible.
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gated = await requireManagementAccessActor(req, id, { allowSelf: true });
  if ("response" in gated) return gated.response;
  const { auth, loaded } = gated;

  const parsed = mobileManagementAccessRemoveBodySchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the request and try again." }, { status: 400 });
  }

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

    const updated = await updateMobileMembershipAccessRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      userId: loaded.userId,
      expectedUpdatedAt: parsed.data.expectedMembershipUpdatedAt,
      departmentIds: [],
      deptAdminIds: [],
    });
    if (!updated) {
      const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
      return conflictResponse(latest?.person ?? loaded.person);
    }
  }

  if (loaded.pendingInvitation) {
    if ((loaded.pendingInvitation.updated_at ?? null) !== parsed.data.expectedInvitationUpdatedAt) {
      return conflictResponse(loaded.person);
    }
    const revoked = await revokeMobileEmployeeInvitationRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      invitationId: loaded.pendingInvitation.id,
      expectedUpdatedAt: parsed.data.expectedInvitationUpdatedAt,
    });
    if (!revoked) {
      const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
      return conflictResponse(latest?.person ?? loaded.person);
    }
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "membership.updated",
    resource_type: "organization_membership",
    resource_id: loaded.userId ?? id,
    details: {
      changedFields: ["departmentIds"],
      employeeId: id,
      departmentIds: [],
      managementAccessRemoved: true,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
  return NextResponse.json(
    mobileManagementAccessResponseSchema.parse({
      success: true,
      result: "access_removed",
      person: person?.person ?? loaded.person,
    }),
  );
}
