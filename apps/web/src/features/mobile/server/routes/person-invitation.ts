import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonInvitationActionBodySchema,
  mobilePersonInvitationCreateBodySchema,
  mobilePersonInvitationResponseSchema,
} from "@dubgrid/contracts";
import {
  createMobileEmployeeInvitationRow,
  fetchMobilePendingInvitationRowByEmployeeId,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  restoreMobileEmployeeInvitationRow,
  revokeMobileEmployeeInvitationRow,
} from "@dubgrid/data-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMobileAuth } from "@/features/mobile/server";
import {
  createInvitationEmailUnavailableResponse,
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";
import { loadMobilePersonWithAccess } from "@/features/mobile/server/person-access";
import { createNameMismatchResponseBody, hasCompleteName, namesMatch } from "@/lib/account-linking";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) {
    return null;
  }

  return forwarded.split(",")[0]?.trim() || null;
}

async function loadMobilePerson(
  serviceClient: Parameters<typeof loadMobilePersonWithAccess>[0],
  orgId: string,
  employeeId: string,
) {
  return (await loadMobilePersonWithAccess(serviceClient, orgId, employeeId))?.person ?? null;
}

async function findExistingOrganizationMemberByEmail(input: {
  serviceClient: SupabaseClient;
  orgId: string;
  email: string;
}): Promise<{ userId: string; email: string } | null> {
  const { data: memberships, error } = await input.serviceClient
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", input.orgId)
    .is("archived_at", null);
  if (error) throw error;

  const normalizedEmail = input.email.trim().toLowerCase();
  const users = await Promise.all(
    ((memberships ?? []) as Array<{ user_id: string }>).map((membership) =>
      input.serviceClient.auth.admin.getUserById(membership.user_id),
    ),
  );

  const match = users.find((result) => result.data.user?.email?.toLowerCase() === normalizedEmail);

  return match?.data.user
    ? {
        userId: match.data.user.id,
        email: match.data.user.email ?? input.email,
      }
    : null;
}

async function fetchProfileName(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<{ firstName: string | null; lastName: string | null }> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return {
    firstName: (data?.first_name as string | null) ?? null,
    lastName: (data?.last_name as string | null) ?? null,
  };
}

async function linkExistingOrganizationMember(input: {
  auth: Awaited<ReturnType<typeof requireMobileAuth>> extends infer Result
    ? Result extends { response: NextResponse }
      ? never
      : Result
    : never;
  employee: Awaited<ReturnType<typeof loadMobilePerson>>;
  employeeId: string;
  linkExistingAccount: boolean;
  memberUserId: string;
  reconcileName: boolean;
  req: NextRequest;
}) {
  if (!input.employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [{ data: otherEmployees }, profileName] = await Promise.all([
    input.auth.serviceClient
      .from("employees")
      .select("id")
      .eq("org_id", input.auth.currentOrg.id)
      .eq("user_id", input.memberUserId)
      .neq("id", input.employeeId)
      .limit(1),
    fetchProfileName(input.auth.serviceClient, input.memberUserId),
  ]);

  if ((otherEmployees?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "That account is already linked to another employee in this organization.",
      },
      { status: 409 },
    );
  }

  const namesAlreadyMatch = namesMatch(
    {
      firstName: input.employee.firstName,
      lastName: input.employee.lastName,
    },
    profileName,
  );
  const challengeDetails = {
    employeeId: input.employeeId,
    userId: input.memberUserId,
    employeeFirstName: input.employee.firstName,
    employeeLastName: input.employee.lastName,
    accountFirstName: profileName.firstName ?? "",
    accountLastName: profileName.lastName ?? "",
  };

  if (!input.linkExistingAccount) {
    return NextResponse.json(
      {
        code: "ACCOUNT_FOUND",
        error: "An existing account was found for this email.",
        details: challengeDetails,
      },
      { status: 409 },
    );
  }

  if (!hasCompleteName(profileName)) {
    return NextResponse.json(
      createNameMismatchResponseBody(
        challengeDetails,
        "The user account must have a first and last name before it can be linked.",
      ),
      { status: 409 },
    );
  }

  if (!namesAlreadyMatch && !input.reconcileName) {
    return NextResponse.json(createNameMismatchResponseBody(challengeDetails), { status: 409 });
  }

  const updatePayload = {
    ...(input.reconcileName && !namesAlreadyMatch
      ? {
          first_name: profileName.firstName,
          last_name: profileName.lastName,
        }
      : {}),
    user_id: input.memberUserId,
    updated_by: input.auth.user.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await input.auth.serviceClient
    .from("employees")
    .update(updatePayload)
    .eq("id", input.employeeId)
    .eq("org_id", input.auth.currentOrg.id);

  if (error) throw error;

  const pendingInvitation = await fetchMobilePendingInvitationRowByEmployeeId(
    input.auth.serviceClient,
    input.auth.currentOrg.id,
    input.employeeId,
  );
  if (pendingInvitation) {
    await revokeMobileEmployeeInvitationRow(input.auth.serviceClient, {
      orgId: input.auth.currentOrg.id,
      invitationId: pendingInvitation.id,
      expectedUpdatedAt: pendingInvitation.updated_at ?? null,
    });
  }

  await insertMobileAuditLogEntry(input.auth.serviceClient, {
    org_id: input.auth.currentOrg.id,
    actor_id: input.auth.user.id,
    actor_email: input.auth.user.email ?? null,
    action: "employee.updated",
    resource_type: "employee",
    resource_id: input.employeeId,
    details: {
      linkedUserId: input.memberUserId,
      ...(input.reconcileName && !namesAlreadyMatch
        ? {
            nameReconciled: true,
            resolution: "use_account_name",
            previousEmployeeFirstName: input.employee.firstName,
            previousEmployeeLastName: input.employee.lastName,
            accountFirstName: profileName.firstName ?? "",
            accountLastName: profileName.lastName ?? "",
          }
        : {}),
    },
    ip_address: getRequestIp(input.req),
    user_agent: input.req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePerson(
    input.auth.serviceClient,
    input.auth.currentOrg.id,
    input.employeeId,
  );

  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "account_linked",
      person,
    }),
  );
}

async function requireManageableEmployee(req: NextRequest, employeeId: string) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;

  if (!auth.permissions.canManageEmployees) {
    return {
      response: NextResponse.json(
        { error: "You don't have permission to manage staff invitations." },
        { status: 403 },
      ),
    };
  }

  const employee = await loadMobilePerson(auth.serviceClient, auth.currentOrg.id, employeeId);
  if (!employee) {
    return {
      response: NextResponse.json({ error: "Employee not found" }, { status: 404 }),
    };
  }
  if (employee.status === "removed" || employee.userId) {
    return {
      response: NextResponse.json({ error: "This employee cannot be invited." }, { status: 400 }),
    };
  }

  return { auth, employee };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await requireManageableEmployee(req, id);
  if ("response" in loaded) return loaded.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that invitation. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobilePersonInvitationCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details and try again." },
      { status: 400 },
    );
  }

  const existingMember = await findExistingOrganizationMemberByEmail({
    serviceClient: loaded.auth.serviceClient,
    orgId: loaded.auth.currentOrg.id,
    email: parsed.data.email,
  });

  if (existingMember) {
    return linkExistingOrganizationMember({
      auth: loaded.auth,
      employee: loaded.employee,
      employeeId: id,
      linkExistingAccount: parsed.data.linkExistingAccount ?? false,
      memberUserId: existingMember.userId,
      reconcileName: parsed.data.reconcileName ?? false,
      req,
    });
  }

  const existingInvitation = await fetchMobilePendingInvitationRowByEmployeeId(
    loaded.auth.serviceClient,
    loaded.auth.currentOrg.id,
    id,
  );
  if (existingInvitation) {
    return NextResponse.json(
      { error: "An active invitation already exists for this employee." },
      { status: 409 },
    );
  }

  const emailConfig = getInvitationEmailConfig();
  if (!emailConfig) {
    return createInvitationEmailUnavailableResponse();
  }

  const invitation = await createMobileEmployeeInvitationRow(loaded.auth.serviceClient, {
    orgId: loaded.auth.currentOrg.id,
    employeeId: id,
    invitedBy: loaded.auth.user.id,
    email: parsed.data.email,
    roleToAssign: "user",
  });
  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: invitation.token,
      email: invitation.email,
      orgName: loaded.auth.currentOrg.name || "your organization",
      expiresAt: invitation.expires_at,
      timeZone: loaded.auth.currentOrg.timezone ?? null,
      kind: "new",
    });
  } catch (error) {
    logger.error(
      { err: error, employeeId: id, invitationId: invitation.id },
      "Failed to send mobile invitation email",
    );
    await revokeMobileEmployeeInvitationRow(loaded.auth.serviceClient, {
      orgId: loaded.auth.currentOrg.id,
      invitationId: invitation.id,
      expectedUpdatedAt: invitation.updated_at ?? null,
    }).catch((revokeError) => {
      logger.error(
        { err: revokeError, employeeId: id, invitationId: invitation.id },
        "Failed to revoke mobile invitation after email failure",
      );
    });
    return NextResponse.json(
      { error: "We couldn't send that invitation email. Try again in a moment." },
      { status: 502 },
    );
  }
  await insertMobileAuditLogEntry(loaded.auth.serviceClient, {
    org_id: loaded.auth.currentOrg.id,
    actor_id: loaded.auth.user.id,
    actor_email: loaded.auth.user.email ?? null,
    action: "invitation.created",
    resource_type: "invitation",
    resource_id: invitation.id,
    details: {
      changedFields: ["email", "employeeId", "roleToAssign"],
      email: invitation.email,
      employeeId: id,
      roleToAssign: "user",
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePerson(loaded.auth.serviceClient, loaded.auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "invitation_sent",
      person,
    }),
  );
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await requireManageableEmployee(req, id);
  if ("response" in loaded) return loaded.response;

  const parsed = mobilePersonInvitationActionBodySchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details and try again." },
      { status: 400 },
    );
  }

  const emailConfig = getInvitationEmailConfig();
  if (!emailConfig) {
    return createInvitationEmailUnavailableResponse();
  }

  // Read the pending invite and run the optimistic check before anything changes.
  const existing = await fetchMobilePendingInvitationRowByEmployeeId(
    loaded.auth.serviceClient,
    loaded.auth.currentOrg.id,
    id,
  );
  if (
    !existing ||
    existing.id !== parsed.data.invitationId ||
    existing.updated_at !== parsed.data.expectedUpdatedAt
  ) {
    return NextResponse.json(
      { error: "Invitation changed elsewhere. Refresh and try again." },
      { status: 409 },
    );
  }

  const existingMember = await findExistingOrganizationMemberByEmail({
    serviceClient: loaded.auth.serviceClient,
    orgId: loaded.auth.currentOrg.id,
    email: existing.email,
  });

  if (existingMember) {
    return linkExistingOrganizationMember({
      auth: loaded.auth,
      employee: loaded.employee,
      employeeId: id,
      linkExistingAccount: false,
      memberUserId: existingMember.userId,
      reconcileName: false,
      req,
    });
  }

  // Stored first, then sent, and restored if the send fails. Sending first
  // could email a token that a concurrent change then kept from ever being
  // stored (finding F-10). The client refetches after a failure, so its next
  // attempt carries the restored row's version.
  const refresh = await refreshMobileEmployeeInvitationRow(loaded.auth.serviceClient, {
    orgId: loaded.auth.currentOrg.id,
    invitationId: parsed.data.invitationId,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });
  if (!refresh || refresh.invitation.employee_id !== id) {
    return NextResponse.json(
      { error: "Invitation changed elsewhere. Refresh and try again." },
      { status: 409 },
    );
  }

  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: refresh.invitation.token,
      email: refresh.invitation.email,
      orgName: loaded.auth.currentOrg.name || "your organization",
      expiresAt: refresh.invitation.expires_at,
      timeZone: loaded.auth.currentOrg.timezone ?? null,
      kind: "reissue",
    });
  } catch (error) {
    logger.error(
      { err: error, employeeId: id, invitationId: existing.id },
      "Failed to resend mobile invitation email",
    );
    await restoreMobileEmployeeInvitationRow(loaded.auth.serviceClient, {
      orgId: loaded.auth.currentOrg.id,
      invitationId: refresh.invitation.id,
      rotatedToken: refresh.invitation.token,
      previousToken: refresh.previousToken,
      previousExpiresAt: refresh.previousExpiresAt,
    }).catch((restoreError) => {
      logger.error(
        { err: restoreError, employeeId: id, invitationId: existing.id },
        "Failed to restore the previous invitation link after a resend email failed",
      );
    });
    return NextResponse.json(
      { error: "We couldn't send that invitation email. Try again in a moment." },
      { status: 502 },
    );
  }

  const person = await loadMobilePerson(loaded.auth.serviceClient, loaded.auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "invitation_resent",
      person,
    }),
  );
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await requireManageableEmployee(req, id);
  if ("response" in loaded) return loaded.response;

  const parsed = mobilePersonInvitationActionBodySchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the invitation details and try again." },
      { status: 400 },
    );
  }

  const invitation = await revokeMobileEmployeeInvitationRow(loaded.auth.serviceClient, {
    orgId: loaded.auth.currentOrg.id,
    invitationId: parsed.data.invitationId,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });
  if (!invitation || invitation.employee_id !== id) {
    return NextResponse.json(
      { error: "Invitation changed elsewhere. Refresh and try again." },
      { status: 409 },
    );
  }

  await insertMobileAuditLogEntry(loaded.auth.serviceClient, {
    org_id: loaded.auth.currentOrg.id,
    actor_id: loaded.auth.user.id,
    actor_email: loaded.auth.user.email ?? null,
    action: "invitation.revoked",
    resource_type: "invitation",
    resource_id: invitation.id,
    details: {
      changedFields: ["revokedAt"],
      email: invitation.email,
      employeeId: id,
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  const person = await loadMobilePerson(loaded.auth.serviceClient, loaded.auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "invitation_revoked",
      person,
    }),
  );
}
