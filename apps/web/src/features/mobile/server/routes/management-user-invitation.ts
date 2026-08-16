import { NextResponse, type NextRequest } from "next/server";
import {
  mobileManagementUserInvitationActionBodySchema,
  mobileManagementUserResponseSchema,
} from "@dubgrid/contracts";
import {
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  revokeMobileEmployeeInvitationRow,
} from "@dubgrid/data-access";
import {
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

export async function POST(req: NextRequest, context: { params: Promise<{ personId: string }> }) {
  const { personId } = await context.params;
  const gated = await requireManagementRosterActor(req);
  if ("response" in gated) return gated.response;
  const { auth } = gated;

  const parsed = mobileManagementUserInvitationActionBodySchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details and try again." },
      { status: 400 },
    );
  }

  const managementUser = await findManagementUser(auth.serviceClient, auth.currentOrg.id, personId);
  if (!managementUser?.invitationId) {
    return NextResponse.json({ error: "Pending invitation not found" }, { status: 404 });
  }
  if (managementUser.updatedAt !== parsed.data.expectedUpdatedAt) {
    return managementConflictResponse();
  }

  if (parsed.data.action === "revoke") {
    const revoked = await revokeMobileEmployeeInvitationRow(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      invitationId: managementUser.invitationId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    if (!revoked) return managementConflictResponse();

    await insertMobileAuditLogEntry(auth.serviceClient, {
      org_id: auth.currentOrg.id,
      actor_id: auth.user.id,
      actor_email: auth.user.email ?? null,
      action: "invitation.revoked",
      resource_type: "invitation",
      resource_id: managementUser.invitationId,
      details: { email: managementUser.email, managementOnly: !managementUser.employeeId },
      ip_address: getRequestIp(req),
      user_agent: req.headers?.get("user-agent") ?? null,
    });

    return NextResponse.json(
      mobileManagementUserResponseSchema.parse({
        success: true,
        result: "invitation_revoked",
        managementUser: null,
      }),
    );
  }

  const emailConfig = getInvitationEmailConfig();
  if (!emailConfig) {
    return createInvitationEmailUnavailableResponse();
  }

  // Refreshed first so the emailed link is the token that is actually stored.
  // A send failure leaves a valid, un-emailed invitation rather than a revoked
  // one — the person keeps whatever access they already had, and a retry works.
  const refreshed = await refreshMobileEmployeeInvitationRow(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    invitationId: managementUser.invitationId,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });
  if (!refreshed) return managementConflictResponse();

  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: refreshed.token,
      email: refreshed.email,
      orgName: auth.currentOrg.name || "your organization",
      inviterName: auth.user.email ?? null,
    });
  } catch (error) {
    logger.error(
      { err: error, invitationId: refreshed.id },
      "Failed to resend mobile management invitation email",
    );
    return NextResponse.json(
      { error: "Invitation email could not be sent. Try again in a moment." },
      { status: 502 },
    );
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "invitation.resent",
    resource_type: "invitation",
    resource_id: refreshed.id,
    details: { email: refreshed.email, managementOnly: !managementUser.employeeId },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const latest = await findManagementUser(auth.serviceClient, auth.currentOrg.id, personId);
  return NextResponse.json(
    mobileManagementUserResponseSchema.parse({
      success: true,
      result: "invitation_resent",
      managementUser: latest,
    }),
  );
}
