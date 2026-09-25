import { NextResponse, type NextRequest } from "next/server";
import {
  mobileManagementUserInviteBodySchema,
  mobileManagementUserResponseSchema,
  mobileManagementUsersResponseSchema,
} from "@dubgrid/contracts";
import {
  createMobileEmployeeInvitationRow,
  insertMobileAuditLogEntry,
  revokeMobileEmployeeInvitationRow,
} from "@dubgrid/data-access";
import {
  findInvalidManagementDepartmentIds,
  getRequestIp,
  loadManagementUsers,
  requireManagementRosterActor,
  toManagementUsers,
} from "@/features/mobile/server/management-roster";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Read-only: a manager who can't grant access can still see who holds it.
  const gated = await requireManagementRosterActor(req, { viewOnly: true });
  if ("response" in gated) return gated.response;

  const managementUsers = await loadManagementUsers(
    gated.auth.serviceClient,
    gated.auth.currentOrg.id,
  );

  return NextResponse.json(mobileManagementUsersResponseSchema.parse({ managementUsers }));
}

export async function POST(req: NextRequest) {
  const gated = await requireManagementRosterActor(req);
  if ("response" in gated) return gated.response;
  const { auth } = gated;

  const parsed = mobileManagementUserInviteBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details and try again." },
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

  const email = parsed.data.email.trim().toLowerCase();

  // An existing management user (member or pending invite) with this address
  // would otherwise end up with two competing sets of departments.
  const existing = await loadManagementUsers(auth.serviceClient, auth.currentOrg.id);
  if (existing.some((candidate) => candidate.email.trim().toLowerCase() === email)) {
    return NextResponse.json(
      { error: "Someone with that email is already on the management roster." },
      { status: 409 },
    );
  }

  const emailConfig = getInvitationEmailConfig();
  if (!emailConfig) {
    return createInvitationEmailUnavailableResponse();
  }

  const invitation = await createMobileEmployeeInvitationRow(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    // Management-only: no staff profile, so nothing to attach the invite to.
    employeeId: null,
    invitedBy: auth.user.id,
    email,
    roleToAssign: parsed.data.orgRole,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    phone: parsed.data.phone || null,
    departmentIds,
    deptAdminIds: [],
  });

  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: invitation.token,
      email: invitation.email,
      orgName: auth.currentOrg.name || "your organization",
      expiresAt: invitation.expires_at,
      timeZone: auth.currentOrg.timezone ?? null,
      kind: "new",
    });
  } catch (error) {
    logger.error(
      { err: error, invitationId: invitation.id },
      "Failed to send mobile management-only invitation email",
    );
    // The row only exists because of this request, and its whole purpose was
    // the email — leaving it behind would put a person on the roster who was
    // never actually invited.
    await revokeMobileEmployeeInvitationRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      invitationId: invitation.id,
      expectedUpdatedAt: invitation.updated_at ?? null,
    }).catch((revokeError) => {
      logger.error(
        { err: revokeError, invitationId: invitation.id },
        "Failed to revoke mobile management-only invitation after email failure",
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
    action: "invitation.created",
    resource_type: "invitation",
    resource_id: invitation.id,
    details: {
      changedFields: ["email", "roleToAssign", "departmentIds"],
      email: invitation.email,
      roleToAssign: parsed.data.orgRole,
      departmentIds,
      managementOnly: true,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const [managementUser] = toManagementUsers({ memberships: [], invitations: [invitation] });
  return NextResponse.json(
    mobileManagementUserResponseSchema.parse({
      success: true,
      result: "invitation_sent",
      managementUser,
    }),
  );
}
