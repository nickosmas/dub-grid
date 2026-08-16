import { NextResponse, type NextRequest } from "next/server";
import {
  mobileManagementAccessBodySchema,
  mobileManagementAccessRemoveBodySchema,
  mobileManagementAccessResponseSchema,
} from "@dubgrid/contracts";
import {
  createMobileEmployeeInvitationRow,
  fetchMobileDepartmentRows,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  revokeMobileEmployeeInvitationRow,
  updateMobileInvitationAssignmentsRow,
  updateMobileMembershipAccessRow,
} from "@dubgrid/data-access";
import { SELF_ACTION_FORBIDDEN_CODE, SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMobileAuth } from "@/features/mobile/server";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";
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

/**
 * Shared gate for both verbs: granting management access and setting org roles
 * is super_admin-or-gridmaster, the same bar web holds this behind, and never
 * something you may do to your own account.
 */
async function requireManagementAccessActor(req: NextRequest, employeeId: string) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;

  if (!auth.permissions.canManageUsers) {
    return {
      response: NextResponse.json(
        { error: "You don't have permission to manage management access." },
        { status: 403 },
      ),
    };
  }

  const loaded = await loadMobilePersonWithAccess(
    auth.serviceClient,
    auth.currentOrg.id,
    employeeId,
  );
  if (!loaded) {
    return { response: NextResponse.json({ error: "Employee not found" }, { status: 404 }) };
  }
  if (loaded.person.status === "removed") {
    return {
      response: NextResponse.json(
        { error: "Removed staff can't be given management access." },
        { status: 400 },
      ),
    };
  }
  if (loaded.userId && loaded.userId === auth.user.id) {
    return {
      response: NextResponse.json(
        { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
        { status: 403 },
      ),
    };
  }

  return { auth, loaded };
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gated = await requireManagementAccessActor(req, id);
  if ("response" in gated) return gated.response;
  const { auth, loaded } = gated;

  const parsed = mobileManagementAccessBodySchema.safeParse(await req.json().catch(() => null));
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

    const updated = await updateMobileMembershipAccessRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      userId: loaded.userId,
      expectedUpdatedAt: parsed.data.expectedMembershipUpdatedAt,
      orgRole: parsed.data.orgRole,
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
  if (loaded.pendingInvitation) {
    if ((loaded.pendingInvitation.updated_at ?? null) !== parsed.data.expectedInvitationUpdatedAt) {
      return conflictResponse(loaded.person);
    }

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
    invitation = await refreshMobileEmployeeInvitationRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      invitationId: reassigned.id,
      expectedUpdatedAt: reassigned.updated_at ?? null,
    });
    if (!invitation) {
      const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
      return conflictResponse(latest?.person ?? loaded.person);
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
      inviterName: auth.user.email ?? null,
    });
  } catch (error) {
    logger.error(
      { err: error, employeeId: id, invitationId: invitation.id },
      "Failed to send mobile management invitation email",
    );
    // Only a row this request brought into existence gets rolled back. An
    // invitation that already existed stays put: revoking it would take away
    // access the failed email never had anything to do with.
    if (createdInvitation) {
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
      { error: "Invitation email could not be sent. Try again in a moment." },
      { status: 502 },
    );
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: createdInvitation ? "invitation.created" : "invitation.updated",
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
  const gated = await requireManagementAccessActor(req, id);
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
