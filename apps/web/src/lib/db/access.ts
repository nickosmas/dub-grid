import type { AdminPermissions, Invitation, OrganizationRole, OrganizationUser } from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface ErrorBody {
  error?: string;
  code?: string;
  user?: OrganizationUser;
  invitation?: Invitation;
  token?: string;
  expiresAt?: string;
}

export class OrganizationAccessConflictError extends Error {
  constructor(public readonly latestUser: OrganizationUser) {
    super("Organization access changed elsewhere.");
    this.name = "OrganizationAccessConflictError";
  }
}

export class InvitationAccessConflictError extends Error {
  constructor(public readonly latestInvitation: Invitation) {
    super("Invitation changed elsewhere.");
    this.name = "InvitationAccessConflictError";
  }
}

async function parseBody(response: Response): Promise<ErrorBody | null> {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return null;
  }
}

function getErrorMessage(body: ErrorBody | null, fallback: string): string {
  return formatClientErrorMessage(body?.error, fallback);
}

export async function updateOrganizationMembershipGuarded(input: {
  orgId: string;
  userId: string;
  expectedUpdatedAt: string;
  orgRole?: OrganizationRole;
  adminPermissions?: AdminPermissions | null;
}): Promise<OrganizationUser> {
  const response = await fetch("/api/organizations/access", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.user) {
    throw new OrganizationAccessConflictError(body.user);
  }

  if (!response.ok || !body?.user) {
    throw new Error(getErrorMessage(body, "Failed to update organization access"));
  }

  return body.user;
}

export async function removeOrganizationMembershipGuarded(input: {
  orgId: string;
  userId: string;
  expectedUpdatedAt: string;
}): Promise<void> {
  const response = await fetch("/api/organizations/access", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.user) {
    throw new OrganizationAccessConflictError(body.user);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to remove organization access"));
  }
}

export async function updateOrganizationInvitationGuarded(input: {
  orgId: string;
  invitationId: string;
  expectedUpdatedAt: string;
  email?: string;
  roleToAssign?: OrganizationRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  departmentIds?: number[];
  deptAdminIds?: number[];
}): Promise<Invitation> {
  const response = await fetch("/api/organizations/invitations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation) {
    throw new Error(getErrorMessage(body, "Failed to update invitation"));
  }

  return body.invitation;
}

export async function revokeOrganizationInvitationGuarded(input: {
  orgId: string;
  invitationId: string;
  expectedUpdatedAt: string;
}): Promise<Invitation> {
  const response = await fetch("/api/organizations/invitations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation) {
    throw new Error(getErrorMessage(body, "Failed to revoke invitation"));
  }

  return body.invitation;
}

export async function resendOrganizationInvitationGuarded(input: {
  orgId: string;
  invitationId: string;
  expectedUpdatedAt: string;
}): Promise<{ invitation: Invitation; token: string; expiresAt: string }> {
  const response = await fetch("/api/organizations/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: "resend" }),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation || !body.token || !body.expiresAt) {
    throw new Error(getErrorMessage(body, "Failed to resend invitation"));
  }

  return {
    invitation: body.invitation,
    token: body.token,
    expiresAt: body.expiresAt,
  };
}
