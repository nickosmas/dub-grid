import "server-only";

import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Employee } from "@dubgrid/domain";
import { indefiniteArticle } from "@dubgrid/domain";
import { buildPermissionContext } from "@dubgrid/authz";
import { fetchLinkedEmployeeForUser } from "@/features/mobile/server";
import { deleteUserAccountWithCleanup } from "@/features/account/server/account-deletion";
import { cacheDel, CacheKey } from "@/lib/cache";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import { rowToEmployee } from "@/lib/db/mappers";
import logger from "@/lib/logger";
import type { DbEmployee } from "@/lib/db/types";
import type { AdminPermissions, OrganizationRole } from "@/types";

export const profileRequestedChangesSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    employmentType: z.enum(["full_time", "part_time"]).optional(),
    certificationId: z.number().int().nullable().optional(),
    focusAreaIds: z.array(z.number().int()).min(1).optional(),
    roleIds: z.array(z.number().int()).optional(),
    departmentIds: z.array(z.number().int()).optional(),
  })
  .strict();

export const createProfileChangeRequestSchema = z
  .object({
    orgId: z.string().uuid(),
    type: z.enum(["profile_update", "account_deletion"]),
    requestedChanges: profileRequestedChangesSchema.optional(),
    requestNote: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.type === "profile_update" &&
      Object.keys(value.requestedChanges ?? {}).length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Profile update requests must include at least one change",
        path: ["requestedChanges"],
      });
    }
  });

export const resolveProfileChangeRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  resolverNote: z.string().trim().max(1000).optional(),
});

export type ProfileRequestedChanges = z.infer<typeof profileRequestedChangesSchema>;
export type ProfileChangeRequestType = "profile_update" | "account_deletion";
export type ProfileChangeRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface ProfileChangeRequestRecord {
  id: string;
  orgId: string;
  requesterUserId: string | null;
  requesterEmployeeId: string | null;
  requesterEmployeeVersion: number | null;
  requesterName: string;
  requesterEmail: string | null;
  type: ProfileChangeRequestType;
  status: ProfileChangeRequestStatus;
  requestedChanges: ProfileRequestedChanges;
  currentValues: Record<string, unknown>;
  requestNote: string;
  resolverUserId: string | null;
  resolverNote: string;
  resolvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

const PROFILE_CHANGE_REQUEST_COLS =
  "id, org_id, requester_user_id, requester_employee_id, requester_employee_version, requester_name, requester_email, request_type, status, requested_changes, current_values, request_note, resolver_user_id, resolver_note, resolved_at, cancelled_at, created_at, updated_at, version";

function mapProfileChangeRequest(row: Record<string, unknown>): ProfileChangeRequestRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    requesterUserId: (row.requester_user_id as string | null) ?? null,
    requesterEmployeeId: (row.requester_employee_id as string | null) ?? null,
    requesterEmployeeVersion:
      (row.requester_employee_version as number | null | undefined) ?? null,
    requesterName: (row.requester_name as string | null) ?? "",
    requesterEmail: (row.requester_email as string | null) ?? null,
    type: row.request_type as ProfileChangeRequestType,
    status: row.status as ProfileChangeRequestStatus,
    requestedChanges: profileRequestedChangesSchema.parse(
      (row.requested_changes as Record<string, unknown> | null) ?? {},
    ),
    currentValues: (row.current_values as Record<string, unknown> | null) ?? {},
    requestNote: (row.request_note as string | null) ?? "",
    resolverUserId: (row.resolver_user_id as string | null) ?? null,
    resolverNote: (row.resolver_note as string | null) ?? "",
    resolvedAt: (row.resolved_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    version: (row.version as number | null | undefined) ?? 0,
  };
}

function getEmployeeDisplayName(employee: Employee | null): string {
  if (!employee) return "";
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
}

function buildCurrentValues(employee: Employee | null): Record<string, unknown> {
  if (!employee) {
    return {};
  }

  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    employmentType: employee.employmentType,
    certificationId: employee.certificationId,
    focusAreaIds: employee.focusAreaIds,
    roleIds: employee.roleIds,
    departmentIds: employee.departmentIds,
    phone: employee.phone,
    version: employee.version,
  };
}

async function assertActiveMembership(
  serviceClient: SupabaseClient,
  userId: string,
  orgId: string,
) {
  const { data, error } = await serviceClient
    .from("organization_memberships")
    .select("org_role, admin_permissions")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as { org_role: OrganizationRole; admin_permissions: AdminPermissions | null } | null;
}

export async function listOwnProfileChangeRequests(input: {
  serviceClient: SupabaseClient;
  userId: string;
  orgId: string;
}): Promise<ProfileChangeRequestRecord[]> {
  const { data, error } = await input.serviceClient
    .from("profile_change_requests")
    .select(PROFILE_CHANGE_REQUEST_COLS)
    .eq("org_id", input.orgId)
    .eq("requester_user_id", input.userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapProfileChangeRequest);
}

export async function listAdminProfileChangeRequests(input: {
  serviceClient: SupabaseClient;
  orgId: string;
  status?: ProfileChangeRequestStatus;
}): Promise<ProfileChangeRequestRecord[]> {
  let query = input.serviceClient
    .from("profile_change_requests")
    .select(PROFILE_CHANGE_REQUEST_COLS)
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: false });

  if (input.status) {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapProfileChangeRequest);
}

async function fetchProfileChangeRequestReviewerIds(input: {
  serviceClient: SupabaseClient;
  orgId: string;
  requesterUserId: string;
}): Promise<string[]> {
  const { data, error } = await input.serviceClient
    .from("organization_memberships")
    .select("user_id, org_role, admin_permissions")
    .eq("org_id", input.orgId)
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  const reviewerIds = new Set<string>();
  for (const row of (data ?? []) as Array<{
    user_id: string;
    org_role: OrganizationRole;
    admin_permissions: AdminPermissions | null;
  }>) {
    if (row.user_id === input.requesterUserId) {
      continue;
    }

    const permissions = buildPermissionContext(
      row.org_role,
      input.orgId,
      row.admin_permissions,
    );
    if (permissions.isSuperAdmin || permissions.canManageEmployees) {
      reviewerIds.add(row.user_id);
    }
  }

  return [...reviewerIds];
}

/**
 * Build a human-readable summary of what a profile-update request is
 * asking to change. Returns a discriminated title (e.g. "Name change") and
 * a list of human-readable change descriptions for the message body.
 */
function summarizeProfileChange(
  type: ProfileChangeRequestType,
  requestedChanges: ProfileRequestedChanges,
  currentValues: Record<string, unknown>,
): {
  shortLabel: string;
  changes: Array<{ field: string; from?: string; to?: string }>;
} {
  if (type === "account_deletion") {
    return { shortLabel: "account deletion", changes: [] };
  }
  const changes: Array<{ field: string; from?: string; to?: string }> = [];

  if (
    requestedChanges.firstName !== undefined ||
    requestedChanges.lastName !== undefined
  ) {
    const currentFirst = String(currentValues.firstName ?? "");
    const currentLast = String(currentValues.lastName ?? "");
    const nextFirst = requestedChanges.firstName ?? currentFirst;
    const nextLast = requestedChanges.lastName ?? currentLast;
    changes.push({
      field: "Name",
      from: `${currentFirst} ${currentLast}`.trim() || undefined,
      to: `${nextFirst} ${nextLast}`.trim() || undefined,
    });
  }
  if (requestedChanges.employmentType !== undefined) {
    const friendly = (v: string) =>
      v === "full_time" ? "Full-time" : v === "part_time" ? "Part-time" : v;
    changes.push({
      field: "Employment type",
      from: typeof currentValues.employmentType === "string"
        ? friendly(currentValues.employmentType)
        : undefined,
      to: friendly(requestedChanges.employmentType),
    });
  }
  if (requestedChanges.certificationId !== undefined) {
    changes.push({ field: "Certification" });
  }
  if (requestedChanges.focusAreaIds !== undefined) {
    changes.push({ field: "Focus areas" });
  }
  if (requestedChanges.roleIds !== undefined) {
    changes.push({ field: "Roles" });
  }
  if (requestedChanges.departmentIds !== undefined) {
    changes.push({ field: "Departments" });
  }

  // Discriminated short label — most-specific wins.
  let shortLabel: string;
  if (changes.length === 1) {
    shortLabel = `${changes[0]!.field.toLowerCase()} change`;
  } else if (changes.length > 1) {
    shortLabel = "profile change";
  } else {
    shortLabel = "profile change";
  }
  return { shortLabel, changes };
}

function capitalizeFirst(value: string): string {
  return value.length > 0
    ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
    : value;
}

async function notifyProfileChangeRequestReviewers(input: {
  serviceClient: SupabaseClient;
  request: ProfileChangeRequestRecord;
}): Promise<void> {
  if (!input.request.requesterUserId) {
    return;
  }

  try {
    const reviewerIds = await fetchProfileChangeRequestReviewerIds({
      serviceClient: input.serviceClient,
      orgId: input.request.orgId,
      requesterUserId: input.request.requesterUserId,
    });
    if (reviewerIds.length === 0) {
      return;
    }

    const { shortLabel, changes } = summarizeProfileChange(
      input.request.type,
      input.request.requestedChanges,
      input.request.currentValues,
    );
    const requesterName = input.request.requesterName || "A teammate";
    const title = capitalizeFirst(`${shortLabel} request`);

    let message: string;
    if (input.request.type === "account_deletion") {
      message = `${requesterName} requested to delete their account.`;
    } else if (changes.length === 1) {
      const change = changes[0]!;
      if (change.from && change.to) {
        message = `${requesterName} requested ${shortLabel}: "${change.from}" → "${change.to}".`;
      } else if (change.to) {
        message = `${requesterName} requested ${shortLabel}: "${change.to}".`;
      } else {
        message = `${requesterName} requested ${shortLabel}.`;
      }
    } else if (changes.length > 1) {
      const fields = changes.map((c) => c.field.toLowerCase()).join(", ");
      message = `${requesterName} requested a profile change to: ${fields}.`;
    } else {
      message = `${requesterName} submitted ${indefiniteArticle(shortLabel)} ${shortLabel} request.`;
    }

    const changeDetails = changes
      .filter((c) => c.from || c.to)
      .reduce<Record<string, string>>((acc, c) => {
        if (c.from && c.to) acc[c.field] = `${c.from} → ${c.to}`;
        else if (c.to) acc[c.field] = c.to;
        return acc;
      }, {});

    const { error } = await input.serviceClient.from("notifications").insert(
      reviewerIds.map((userId) => ({
        user_id: userId,
        org_id: input.request.orgId,
        type: "system",
        channel: "in_app",
        category: "system",
        title,
        message,
        metadata: {
          requestedBy: requesterName,
          ...changeDetails,
          ...(input.request.requestNote
            ? { note: input.request.requestNote }
            : {}),
          actionUrl: "/people?section=requests",
          actionLabel: "Review request",
        },
      })),
    );
    if (error) {
      throw error;
    }
  } catch (error) {
    logger.error(
      { error, requestId: input.request.id, orgId: input.request.orgId },
      "Failed to notify profile change request reviewers",
    );
  }
}

export async function createProfileChangeRequest(input: {
  serviceClient: SupabaseClient;
  user: User;
  orgId: string;
  type: ProfileChangeRequestType;
  requestedChanges?: ProfileRequestedChanges;
  requestNote?: string;
}): Promise<ProfileChangeRequestRecord> {
  const membership = await assertActiveMembership(
    input.serviceClient,
    input.user.id,
    input.orgId,
  );
  if (!membership) {
    throw new Error("You are not an active member of this organization.");
  }
  const permissions = buildPermissionContext(
    membership.org_role,
    input.orgId,
    membership.admin_permissions,
  );
  if (permissions.isSuperAdmin || permissions.canManageEmployees) {
    throw new Error("You can edit profile details directly.");
  }

  const linkedEmployee = await fetchLinkedEmployeeForUser(
    input.serviceClient,
    input.orgId,
    input.user.id,
  );
  if (input.type === "profile_update" && !linkedEmployee) {
    throw new Error("This account is not linked to a staff profile.");
  }

  const { data: existing, error: existingError } = await input.serviceClient
    .from("profile_change_requests")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("requester_user_id", input.user.id)
    .eq("request_type", input.type)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new Error("You already have a pending request of this type.");
  }

  const { data, error } = await input.serviceClient
    .from("profile_change_requests")
    .insert({
      org_id: input.orgId,
      requester_user_id: input.user.id,
      requester_employee_id: linkedEmployee?.id ?? null,
      requester_employee_version: linkedEmployee?.version ?? null,
      requester_name:
        getEmployeeDisplayName(linkedEmployee) ||
        input.user.email?.split("@")[0] ||
        "User",
      requester_email: input.user.email ?? null,
      request_type: input.type,
      requested_changes:
        input.type === "profile_update" ? (input.requestedChanges ?? {}) : {},
      current_values: buildCurrentValues(linkedEmployee),
      request_note: input.requestNote?.trim() ?? "",
    })
    .select(PROFILE_CHANGE_REQUEST_COLS)
    .single();

  if (error) throw error;
  const request = mapProfileChangeRequest(data as Record<string, unknown>);
  await notifyProfileChangeRequestReviewers({
    serviceClient: input.serviceClient,
    request,
  });
  return request;
}

export async function cancelOwnProfileChangeRequest(input: {
  serviceClient: SupabaseClient;
  userId: string;
  requestId: string;
}): Promise<ProfileChangeRequestRecord> {
  const now = new Date().toISOString();
  const { data, error } = await input.serviceClient
    .from("profile_change_requests")
    .update({
      status: "cancelled",
      cancelled_at: now,
      updated_at: now,
      version: 1,
    })
    .eq("id", input.requestId)
    .eq("requester_user_id", input.userId)
    .eq("status", "pending")
    .select(PROFILE_CHANGE_REQUEST_COLS)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Pending request not found.");
  }
  return mapProfileChangeRequest(data as Record<string, unknown>);
}

async function fetchRequestForResolution(
  serviceClient: SupabaseClient,
  orgId: string,
  requestId: string,
): Promise<ProfileChangeRequestRecord> {
  const { data, error } = await serviceClient
    .from("profile_change_requests")
    .select(PROFILE_CHANGE_REQUEST_COLS)
    .eq("id", requestId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Request not found.");
  }
  return mapProfileChangeRequest(data as Record<string, unknown>);
}

async function applyProfileUpdateRequest(input: {
  serviceClient: SupabaseClient;
  request: ProfileChangeRequestRecord;
  actorId: string;
  actorEmail: string | null;
}) {
  const request = input.request;
  if (!request.requesterEmployeeId) {
    throw new Error("This request is not linked to a staff profile.");
  }

  const { data: currentRow, error: currentError } = await input.serviceClient
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", request.orgId)
    .eq("id", request.requesterEmployeeId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!currentRow) {
    throw new Error("The linked staff profile no longer exists.");
  }

  const currentEmployee = rowToEmployee(currentRow as DbEmployee);
  if (
    request.requesterEmployeeVersion != null &&
    currentEmployee.version !== request.requesterEmployeeVersion
  ) {
    throw new Error(
      "The staff profile changed after this request was submitted. Review the latest values before approving.",
    );
  }

  const changes = request.requestedChanges;
  const update: Record<string, unknown> = {
    updated_by: input.actorId,
    updated_at: new Date().toISOString(),
  };
  if (changes.firstName !== undefined) update.first_name = changes.firstName.trim();
  if (changes.lastName !== undefined) update.last_name = changes.lastName.trim();
  if (changes.employmentType !== undefined) update.employment_type = changes.employmentType;
  if (changes.certificationId !== undefined) update.certification_id = changes.certificationId;
  if (changes.focusAreaIds !== undefined) update.focus_area_ids = changes.focusAreaIds;
  if (changes.roleIds !== undefined) update.role_ids = changes.roleIds;
  if (changes.departmentIds !== undefined) update.department_ids = changes.departmentIds;

  const { error: employeeError } = await input.serviceClient
    .from("employees")
    .update(update)
    .eq("org_id", request.orgId)
    .eq("id", request.requesterEmployeeId)
    .eq("version", currentEmployee.version);
  if (employeeError) throw employeeError;

  if (
    currentEmployee.userId &&
    (changes.firstName !== undefined || changes.lastName !== undefined)
  ) {
    const { error: profileError } = await input.serviceClient
      .from("profiles")
      .update({
        first_name: changes.firstName ?? currentEmployee.firstName,
        last_name: changes.lastName ?? currentEmployee.lastName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentEmployee.userId);
    if (profileError) throw profileError;
  }

  await Promise.all([
    cacheDel(
      CacheKey.employees(request.orgId),
      CacheKey.orgDirectory(request.orgId),
      CacheKey.tenantStats(),
    ),
    input.serviceClient.from("audit_log").insert({
      org_id: request.orgId,
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      action: "employee.updated",
      resource_type: "employee",
      resource_id: request.requesterEmployeeId,
      details: {
        source: "profile_change_request",
        requestId: request.id,
        changedFields: Object.keys(changes),
      },
    }),
  ]);
}

export async function resolveProfileChangeRequest(input: {
  serviceClient: SupabaseClient;
  actor: User;
  orgId: string;
  requestId: string;
  action: "approve" | "reject";
  resolverNote?: string;
}): Promise<ProfileChangeRequestRecord> {
  const request = await fetchRequestForResolution(
    input.serviceClient,
    input.orgId,
    input.requestId,
  );
  if (request.status !== "pending") {
    throw new Error("Only pending requests can be resolved.");
  }

  if (input.action === "approve") {
    if (request.type === "profile_update") {
      await applyProfileUpdateRequest({
        serviceClient: input.serviceClient,
        request,
        actorId: input.actor.id,
        actorEmail: input.actor.email ?? null,
      });
    } else {
      if (!request.requesterUserId) {
        throw new Error("This account deletion request no longer has a user.");
      }
      await deleteUserAccountWithCleanup({
        serviceClient: input.serviceClient,
        userId: request.requesterUserId,
        actorId: input.actor.id,
        actorEmail: input.actor.email ?? null,
        reason: "admin_approved_request",
        requestId: request.id,
      });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await input.serviceClient
    .from("profile_change_requests")
    .update({
      status: input.action === "approve" ? "approved" : "rejected",
      resolver_user_id: input.actor.id,
      resolver_note: input.resolverNote?.trim() ?? "",
      resolved_at: now,
      updated_at: now,
      version: request.version + 1,
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select(PROFILE_CHANGE_REQUEST_COLS)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Request changed before it could be resolved.");
  }

  if (request.requesterUserId && request.type !== "account_deletion") {
    // Resolve a human-readable description of the field(s) the admin acted on.
    const { shortLabel, changes } = summarizeProfileChange(
      request.type,
      request.requestedChanges,
      request.currentValues,
    );
    const resolverName = await fetchResolverDisplayName(
      input.serviceClient,
      input.actor.id,
    );
    const verb = input.action === "approve" ? "approved" : "declined";

    let message: string;
    if (changes.length === 1) {
      const c = changes[0]!;
      if (c.from && c.to && input.action === "approve") {
        message = `${resolverName} ${verb} your ${shortLabel}: "${c.from}" → "${c.to}".`;
      } else if (c.to) {
        message = `${resolverName} ${verb} your ${shortLabel} to "${c.to}".`;
      } else {
        message = `${resolverName} ${verb} your ${shortLabel}.`;
      }
    } else if (changes.length > 1) {
      const fields = changes.map((c) => c.field.toLowerCase()).join(", ");
      message = `${resolverName} ${verb} your profile change (${fields}).`;
    } else {
      message = `${resolverName} ${verb} your ${shortLabel} request.`;
    }

    const changeDetails = changes
      .filter((c) => c.from || c.to)
      .reduce<Record<string, string>>((acc, c) => {
        if (c.from && c.to) acc[c.field] = `${c.from} → ${c.to}`;
        else if (c.to) acc[c.field] = c.to;
        return acc;
      }, {});

    const title = capitalizeFirst(
      `${shortLabel} ${input.action === "approve" ? "approved" : "declined"}`,
    );

    await input.serviceClient.from("notifications").insert({
      user_id: request.requesterUserId,
      org_id: request.orgId,
      type: "system",
      channel: "in_app",
      category: "system",
      title,
      message,
      metadata: {
        reviewedBy: resolverName,
        ...changeDetails,
        ...(input.resolverNote?.trim()
          ? { adminNote: input.resolverNote.trim() }
          : {}),
      },
    });
  }

  return mapProfileChangeRequest(data as Record<string, unknown>);
}

async function fetchResolverDisplayName(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await serviceClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  const first = (data?.first_name as string | null) ?? "";
  const last = (data?.last_name as string | null) ?? "";
  const full = `${first} ${last}`.trim();
  return full || "An administrator";
}

export async function canManageProfileChangeRequests(input: {
  serviceClient: SupabaseClient;
  actorId: string;
  orgId: string;
}): Promise<boolean> {
  const [{ data: membership }, { data: profile }] = await Promise.all([
    input.serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", input.actorId)
      .eq("org_id", input.orgId)
      .is("archived_at", null)
      .maybeSingle(),
    input.serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", input.actorId)
      .maybeSingle(),
  ]);
  const role =
    profile?.platform_role === "gridmaster"
      ? "gridmaster"
      : ((membership?.org_role as OrganizationRole | null) ?? "user");
  const permissions = buildPermissionContext(
    role,
    input.orgId,
    (membership?.admin_permissions as AdminPermissions | null) ?? null,
  );

  return (
    permissions.isGridmaster ||
    permissions.isSuperAdmin ||
    permissions.canManageEmployees
  );
}
