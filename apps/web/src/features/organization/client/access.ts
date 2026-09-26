"use client";

import type {
  AdminPermissions,
  AssignableOrganizationRole,
  Invitation,
  Organization,
  OrganizationRole,
  OrganizationUser,
} from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { OrganizationSettingsEditable } from "@/lib/organization-settings";
import { OrganizationRequestError } from "./api";

export interface UpdateOrganizationSettingsInput extends Partial<OrganizationSettingsEditable> {
  orgId: string;
  expectedUpdatedAt: string;
}

interface ErrorBody {
  error?: string;
  code?: string;
  method?: string;
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

export class OrganizationSettingsConflictError extends Error {
  constructor(public readonly latestOrganization: Organization) {
    super("Organization settings were updated by someone else.");
    this.name = "OrganizationSettingsConflictError";
  }
}

export type OrganizationSettingsSaveResult =
  | { status: "saved"; organization: Organization }
  | { status: "changed_elsewhere"; organization: Organization };

function settingValuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Retries a stale settings write once only when none of its edited fields
 * changed on the server. A real same-field race always keeps the server value.
 */
export async function saveOrganizationSettingsWithRecovery(args: {
  baseline: Organization;
  input: UpdateOrganizationSettingsInput;
}): Promise<OrganizationSettingsSaveResult> {
  const { baseline, input } = args;
  try {
    return { status: "saved", organization: await updateOrganizationSettings(input) };
  } catch (error) {
    if (!(error instanceof OrganizationSettingsConflictError)) throw error;

    const editedKeys = Object.keys(input).filter(
      (key) => key !== "orgId" && key !== "expectedUpdatedAt",
    ) as (keyof Organization)[];
    const targetChanged = editedKeys.some(
      (key) => !settingValuesMatch(baseline[key], error.latestOrganization[key]),
    );
    if (targetChanged || !error.latestOrganization.updatedAt) {
      return { status: "changed_elsewhere", organization: error.latestOrganization };
    }

    try {
      return {
        status: "saved",
        organization: await updateOrganizationSettings({
          ...input,
          expectedUpdatedAt: error.latestOrganization.updatedAt,
        }),
      };
    } catch (retryError) {
      if (retryError instanceof OrganizationSettingsConflictError) {
        return { status: "changed_elsewhere", organization: retryError.latestOrganization };
      }
      throw retryError;
    }
  }
}

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
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

async function requestOrganizationJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    // The method lets step-up recognize a request for fresh proof.
    throw Object.assign(
      new OrganizationRequestError(
        formatClientErrorMessage(body?.error, "Organization request failed."),
        response.status,
        null,
        typeof body?.code === "string" ? body.code : null,
      ),
      { method: body?.method },
    );
  }

  return body as T;
}

export interface UserExistsByEmailResult {
  exists: boolean;
  displayName: string | null;
  existsInThisOrg: boolean;
  existingEmployeeId: string | null;
}

/**
 * Pre-flight lookup used by AddEmployeeModal to detect whether the typed
 * email already maps to a DubGrid user. Returns existence + display name
 * only (never the matched user's org list).
 */
export async function checkUserExistsByEmail(
  email: string,
  orgId: string,
): Promise<UserExistsByEmailResult> {
  return requestOrganizationJson<UserExistsByEmailResult>("/api/users/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, orgId }),
  });
}

export function fetchOrganizationUsers(orgId: string): Promise<OrganizationUser[]> {
  const params = new URLSearchParams({ orgId });
  return requestOrganizationJson<{ users: OrganizationUser[] }>(
    `/api/organizations/users?${params}`,
  ).then((data) => data.users);
}

export function fetchOrganizationInvitations(orgId: string): Promise<Invitation[]> {
  const params = new URLSearchParams({ orgId });
  return requestOrganizationJson<{ invitations: Invitation[] }>(
    `/api/organizations/invitations?${params}`,
  ).then((data) => data.invitations);
}

export async function createOrganizationInvitation(
  input: {
    email: string;
    role: AssignableOrganizationRole;
    orgId: string;
    employeeId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    departmentIds?: number[];
    deptAdminIds?: number[];
  },
  accessToken?: string,
): Promise<{ invitationId: string; expiresAt: string; resent?: boolean }> {
  // Creates the invitation and sends its email in one request; a failed send
  // throws, and nothing is left behind.
  return requestOrganizationJson("/api/organizations/invitations/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(input),
  });
}

export async function acceptInvitation(
  token: string,
): Promise<{ status: string; orgId: string; role: string; orgSlug: string | null }> {
  return requestOrganizationJson("/api/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export async function updateOrganizationSettings(
  input: UpdateOrganizationSettingsInput,
): Promise<Organization> {
  const response = await fetch(resolveClientUrl("/api/organizations/settings"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 409) {
    const latestOrganization =
      body &&
      typeof body === "object" &&
      "organization" in body &&
      body.organization &&
      typeof body.organization === "object"
        ? (body.organization as Organization)
        : null;

    if (latestOrganization) {
      throw new OrganizationSettingsConflictError(latestOrganization);
    }
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "We couldn't update the organization settings. Try again.";
    throw new Error(message);
  }

  const organization =
    body &&
    typeof body === "object" &&
    "organization" in body &&
    body.organization &&
    typeof body.organization === "object"
      ? (body.organization as Organization)
      : null;

  if (!organization) {
    throw new Error("Organization settings response did not include organization data");
  }

  return organization;
}

export async function updateOrganizationMembershipGuarded(
  input: {
    orgId: string;
    userId: string;
    expectedUpdatedAt: string;
    orgRole?: OrganizationRole;
    adminPermissions?: AdminPermissions | null;
  },
  accessToken?: string,
): Promise<OrganizationUser> {
  const response = await fetch(resolveClientUrl("/api/organizations/access"), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.user) {
    throw new OrganizationAccessConflictError(body.user);
  }

  if (!response.ok || !body?.user) {
    // Status, code and method let step-up recognize a request for fresh proof.
    throw Object.assign(
      new Error(getErrorMessage(body, "We couldn't update organization access. Try again.")),
      { status: response.status, code: body?.code, method: body?.method },
    );
  }

  return body.user;
}

export async function removeOrganizationMembershipGuarded(input: {
  orgId: string;
  userId: string;
  expectedUpdatedAt: string;
}): Promise<void> {
  const response = await fetch(resolveClientUrl("/api/organizations/access"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.user) {
    throw new OrganizationAccessConflictError(body.user);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "We couldn't remove organization access. Try again."));
  }
}

export async function updateOrganizationInvitationGuarded(
  input: {
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
  },
  accessToken?: string,
): Promise<Invitation> {
  const response = await fetch(resolveClientUrl("/api/organizations/invitations"), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation) {
    throw Object.assign(
      new Error(getErrorMessage(body, "We couldn't update invitation. Try again.")),
      { status: response.status, code: body?.code, method: body?.method },
    );
  }

  return body.invitation;
}

export async function revokeOrganizationInvitationGuarded(input: {
  orgId: string;
  invitationId: string;
  expectedUpdatedAt: string;
}): Promise<Invitation> {
  const response = await fetch(resolveClientUrl("/api/organizations/invitations"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation) {
    throw new Error(getErrorMessage(body, "We couldn't cancel that invitation. Try again."));
  }

  return body.invitation;
}

export async function resendOrganizationInvitationGuarded(input: {
  orgId: string;
  invitationId: string;
  expectedUpdatedAt: string;
}): Promise<{ invitation: Invitation; token: string; expiresAt: string }> {
  const response = await fetch(resolveClientUrl("/api/organizations/invitations"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: "resend" }),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation || !body.token || !body.expiresAt) {
    throw new Error(getErrorMessage(body, "We couldn't resend invitation. Try again."));
  }

  return {
    invitation: body.invitation,
    token: body.token,
    expiresAt: body.expiresAt,
  };
}

export async function replaceOrganizationInvitationAccessGuarded(
  input: {
    orgId: string;
    invitationId: string;
    expectedUpdatedAt: string;
    roleToAssign: OrganizationRole;
  },
  accessToken?: string,
): Promise<{ invitation: Invitation }> {
  const response = await fetch(resolveClientUrl("/api/organizations/invitations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ...input, action: "replace_access" }),
  });

  const body = await parseBody(response);

  if (response.status === 409 && body?.invitation) {
    throw new InvitationAccessConflictError(body.invitation);
  }

  if (!response.ok || !body?.invitation) {
    throw Object.assign(
      new Error(getErrorMessage(body, "We couldn't replace that invitation. Try again.")),
      { status: response.status, code: body?.code, method: body?.method },
    );
  }

  return { invitation: body.invitation };
}

export async function revokeInvitation(invitationId: string, orgId: string): Promise<void> {
  const invitations = await fetchOrganizationInvitations(orgId);
  const invitation = invitations.find((item) => item.id === invitationId);
  if (!invitation?.updatedAt) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }
  await revokeOrganizationInvitationGuarded({
    orgId,
    invitationId,
    expectedUpdatedAt: invitation.updatedAt,
  });
}

export async function resendInvitation(
  invitationId: string,
  orgId: string,
): Promise<{ token: string; expiresAt: string }> {
  const invitations = await fetchOrganizationInvitations(orgId);
  const invitation = invitations.find((item) => item.id === invitationId);
  if (!invitation?.updatedAt) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }
  const resent = await resendOrganizationInvitationGuarded({
    orgId,
    invitationId,
    expectedUpdatedAt: invitation.updatedAt,
  });
  return {
    token: resent.token,
    expiresAt: resent.expiresAt,
  };
}

export async function removeUserFromOrganization(userId: string, orgId: string): Promise<void> {
  const users = await fetchOrganizationUsers(orgId);
  const organizationUser = users.find((item) => item.id === userId);
  if (!organizationUser?.updatedAt) {
    throw new Error("User access data is out of date. Refresh and try again.");
  }

  await removeOrganizationMembershipGuarded({
    orgId,
    userId,
    expectedUpdatedAt: organizationUser.updatedAt,
  });
}

export async function updatePendingInvitation(
  invitationId: string,
  orgId: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    roleToAssign?: OrganizationRole;
    departmentIds?: number[];
    deptAdminIds?: number[];
  },
  accessToken?: string,
): Promise<void> {
  const invitations = await fetchOrganizationInvitations(orgId);
  const invitation = invitations.find((item) => item.id === invitationId);
  if (!invitation?.updatedAt) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }

  await updateOrganizationInvitationGuarded(
    {
      orgId,
      invitationId,
      expectedUpdatedAt: invitation.updatedAt,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      email: data.email?.toLowerCase(),
      roleToAssign: data.roleToAssign,
      departmentIds: data.departmentIds,
      deptAdminIds: data.deptAdminIds,
    },
    accessToken,
  );
}

export async function updateAppOnlyUser(
  userId: string,
  orgId: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    departmentIds?: number[];
    deptAdminIds?: number[];
  },
): Promise<void> {
  await requestOrganizationJson("/api/organizations/app-only-user", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, userId, ...data }),
  });
}
