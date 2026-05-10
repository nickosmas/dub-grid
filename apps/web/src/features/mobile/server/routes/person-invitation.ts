import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonInvitationActionBodySchema,
  mobilePersonInvitationCreateBodySchema,
  mobilePersonInvitationResponseSchema,
} from "@dubgrid/contracts";
import {
  createMobileEmployeeInvitationRow,
  fetchMobileEmployeeRowById,
  fetchMobilePendingInvitationRowByEmployeeId,
  insertMobileAuditLogEntry,
  refreshMobileEmployeeInvitationRow,
  revokeMobileEmployeeInvitationRow,
} from "@dubgrid/data-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMobileAuth } from "@/features/mobile/server";
import {
  createNameMismatchResponseBody,
  hasCompleteName,
  namesMatch,
} from "@/lib/account-linking";
import { emailWrapper, escapeHtml, sanitizeHeaderValue } from "@/lib/email";
import logger from "@/lib/logger";
import { rowToEmployee } from "@/lib/db/mappers";
import { sendResendEmail } from "@/lib/resend";
import { mapEmployeeToMobilePerson } from "./people";

export const dynamic = "force-dynamic";

type InvitationEmailConfig = {
  apiKey: string;
  from: string;
};

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) {
    return null;
  }

  return forwarded.split(",")[0]?.trim() || null;
}

async function loadMobilePerson(
  serviceClient: Parameters<typeof fetchMobileEmployeeRowById>[0],
  orgId: string,
  employeeId: string,
) {
  const row = await fetchMobileEmployeeRowById(
    serviceClient,
    orgId,
    employeeId,
  );
  if (!row) return null;

  const pendingInvitation = await fetchMobilePendingInvitationRowByEmployeeId(
    serviceClient,
    orgId,
    employeeId,
  );

  return mapEmployeeToMobilePerson({
    ...rowToEmployee(row),
    pendingInvitation: pendingInvitation
      ? {
          id: pendingInvitation.id,
          email: pendingInvitation.email,
          expiresAt: pendingInvitation.expires_at,
          updatedAt: pendingInvitation.updated_at ?? null,
        }
      : null,
  });
}

function getInvitationEmailConfig(): InvitationEmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  const from =
    process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
  if (!process.env.RESEND_FROM_EMAIL) {
    logger.warn(
      "RESEND_FROM_EMAIL not set - using test domain for mobile invite",
    );
  }

  return { apiKey, from };
}

function createInvitationEmailUnavailableResponse() {
  return NextResponse.json(
    { error: "Email service not configured" },
    { status: 503 },
  );
}

async function sendInvitationEmail(input: {
  config: InvitationEmailConfig;
  token: string | null | undefined;
  email: string;
  orgName: string;
  inviterName?: string | null;
}) {
  if (!input.token) {
    throw new Error("Invitation token unavailable");
  }

  const emailBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null) ||
    "http://localhost:3000";
  const acceptUrl = `${emailBaseUrl}/accept-invite?token=${encodeURIComponent(input.token)}&email=${encodeURIComponent(input.email)}`;
  const inviterLine = input.inviterName
    ? `<p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;"><strong>${escapeHtml(input.inviterName)}</strong> has invited you to join <strong>${escapeHtml(input.orgName)}</strong> on DubGrid.</p>`
    : `<p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">You've been invited to join <strong>${escapeHtml(input.orgName)}</strong> on DubGrid.</p>`;

  await sendResendEmail({
    apiKey: input.config.apiKey,
    from: input.config.from,
    to: input.email,
    subject: sanitizeHeaderValue(
      `You're invited to join ${input.orgName} on DubGrid`,
    ),
    html: emailWrapper(`
      <h2 style="color:#111410;font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:-0.02em;">You're Invited</h2>
      ${inviterLine}
      <p style="color:#3E433B;font-size:15px;line-height:1.6;margin:0 0 32px;">Click the button below to set your password and accept your invitation.</p>
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${acceptUrl}" style="display:inline-block;padding:14px 40px;background:#2563EB;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;">Accept Invitation</a>
      </div>
      <p style="color:#94A3B8;font-size:13px;line-height:1.6;margin:0 0 8px;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="color:#5A5F57;font-size:13px;line-height:1.6;margin:0 0 24px;word-break:break-all;">${acceptUrl}</p>
      <p style="color:#94A3B8;font-size:13px;margin:0;">This invitation expires in 72 hours.</p>`),
  });
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

  const match = users.find(
    (result) => result.data.user?.email?.toLowerCase() === normalizedEmail,
  );

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
        error:
          "That account is already linked to another employee in this organization.",
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
    return NextResponse.json(
      createNameMismatchResponseBody(challengeDetails),
      { status: 409 },
    );
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

  const employee = await loadMobilePerson(
    auth.serviceClient,
    auth.currentOrg.id,
    employeeId,
  );
  if (!employee) {
    return {
      response: NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      ),
    };
  }
  if (employee.status === "terminated" || employee.userId) {
    return {
      response: NextResponse.json(
        { error: "This employee cannot be invited." },
        { status: 400 },
      ),
    };
  }

  return { auth, employee };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const invitation = await createMobileEmployeeInvitationRow(
    loaded.auth.serviceClient,
    {
      orgId: loaded.auth.currentOrg.id,
      employeeId: id,
      invitedBy: loaded.auth.user.id,
      email: parsed.data.email,
      roleToAssign: "user",
    },
  );
  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: invitation.token,
      email: invitation.email,
      orgName: loaded.auth.currentOrg.name || "your organization",
      inviterName: loaded.auth.user.email ?? null,
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
      { error: "Invitation email could not be sent. Try again in a moment." },
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

  const person = await loadMobilePerson(
    loaded.auth.serviceClient,
    loaded.auth.currentOrg.id,
    id,
  );
  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "invitation_sent",
      person,
    }),
  );
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const invitation = await refreshMobileEmployeeInvitationRow(
    loaded.auth.serviceClient,
    {
      orgId: loaded.auth.currentOrg.id,
      invitationId: parsed.data.invitationId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    },
  );
  if (!invitation || invitation.employee_id !== id) {
    return NextResponse.json(
      { error: "Invitation changed elsewhere. Refresh and try again." },
      { status: 409 },
    );
  }

  const existingMember = await findExistingOrganizationMemberByEmail({
    serviceClient: loaded.auth.serviceClient,
    orgId: loaded.auth.currentOrg.id,
    email: invitation.email,
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

  try {
    await sendInvitationEmail({
      config: emailConfig,
      token: invitation.token,
      email: invitation.email,
      orgName: loaded.auth.currentOrg.name || "your organization",
      inviterName: loaded.auth.user.email ?? null,
    });
  } catch (error) {
    logger.error(
      { err: error, employeeId: id, invitationId: invitation.id },
      "Failed to resend mobile invitation email",
    );
    return NextResponse.json(
      { error: "Invitation email could not be sent. Try again in a moment." },
      { status: 502 },
    );
  }

  const person = await loadMobilePerson(
    loaded.auth.serviceClient,
    loaded.auth.currentOrg.id,
    id,
  );
  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "invitation_resent",
      person,
    }),
  );
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const invitation = await revokeMobileEmployeeInvitationRow(
    loaded.auth.serviceClient,
    {
      orgId: loaded.auth.currentOrg.id,
      invitationId: parsed.data.invitationId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    },
  );
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

  const person = await loadMobilePerson(
    loaded.auth.serviceClient,
    loaded.auth.currentOrg.id,
    id,
  );
  return NextResponse.json(
    mobilePersonInvitationResponseSchema.parse({
      success: true,
      result: "invitation_revoked",
      person,
    }),
  );
}
