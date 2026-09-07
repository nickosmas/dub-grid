import type { SupabaseClient } from "@supabase/supabase-js";
import type { FullAuditLogEntry } from "@/types";

export type AuditRow = Record<string, unknown>;

export type EnrichedAuditEntry<TId = number> = Omit<FullAuditLogEntry, "id"> & { id: TId };

type AuditEntityLabel = {
  name: string | null;
  email: string | null;
};

/**
 * Resolves actor names and target labels for raw `audit_log` rows so a view can
 * name a person without the row carrying anything but ids. Shared by the org
 * activity log and the per-person activity timeline.
 */
export async function enrichAuditRows<TId = number>(
  serviceClient: SupabaseClient,
  rows: AuditRow[],
): Promise<EnrichedAuditEntry<TId>[]> {
  const actorIds = new Set<string>();
  const profileTargetIds = new Set<string>();
  const employeeTargetIds = new Set<string>();
  const invitationTargetIds = new Set<string>();
  const organizationTargetIds = new Set<string>();

  for (const row of rows) {
    const actorId = stringOrNull(row.actor_id);
    if (actorId) actorIds.add(actorId);
    const orgId = stringOrNull(row.org_id);
    if (orgId) organizationTargetIds.add(orgId);

    const resourceType = String(row.resource_type ?? "");
    const resourceId = stringOrNull(row.resource_id);
    const details = recordOrEmpty(row.details);
    const targetUserId = stringOrNull(details.targetUserId ?? details.target_user_id);
    if (targetUserId) profileTargetIds.add(targetUserId);

    if (!resourceId) continue;
    if (resourceType === "employee") {
      employeeTargetIds.add(resourceId);
    } else if (resourceType === "user" || resourceType === "organization_membership") {
      profileTargetIds.add(resourceId);
    } else if (resourceType === "invitation") {
      invitationTargetIds.add(resourceId);
    } else if (resourceType === "organization") {
      organizationTargetIds.add(resourceId);
    }
  }

  const profileLabels = await fetchProfileLabels(serviceClient, [
    ...new Set([...actorIds, ...profileTargetIds]),
  ]);
  const employeeLabels = await fetchEmployeeLabels(serviceClient, [...employeeTargetIds]);
  const invitationLabels = await fetchInvitationLabels(serviceClient, [...invitationTargetIds]);
  const organizationLabels = await fetchOrganizationLabels(serviceClient, [
    ...organizationTargetIds,
  ]);

  return rows.map((row) => {
    const actorId = stringOrNull(row.actor_id);
    const resourceType = String(row.resource_type ?? "");
    const resourceId = stringOrNull(row.resource_id);
    const details = recordOrEmpty(row.details);

    return {
      id: row.id as TId,
      orgId: stringOrNull(row.org_id),
      orgName: stringOrNull(row.org_id)
        ? (organizationLabels.get(String(row.org_id))?.name ?? null)
        : null,
      actorId,
      actorEmail: stringOrNull(row.actor_email),
      actorName: actorId ? (profileLabels.get(actorId)?.name ?? null) : null,
      action: row.action as string,
      resourceType,
      resourceId,
      ...resolveTargetIdentity({
        details,
        resourceType,
        resourceId,
        profileLabels,
        employeeLabels,
        invitationLabels,
        organizationLabels,
      }),
      details,
      createdAt: row.created_at as string,
    };
  });
}

async function fetchProfileLabels(serviceClient: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, AuditEntityLabel>();
  const { data, error } = await serviceClient
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    ((data ?? []) as AuditRow[]).map(
      (row) =>
        [String(row.id), { name: fullName(row.first_name, row.last_name), email: null }] as const,
    ),
  );
}

async function fetchEmployeeLabels(serviceClient: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, AuditEntityLabel>();
  const { data, error } = await serviceClient
    .from("employees")
    .select("id, first_name, last_name, email")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    ((data ?? []) as AuditRow[]).map(
      (row) =>
        [
          String(row.id),
          {
            name: fullName(row.first_name, row.last_name),
            email: stringOrNull(row.email),
          },
        ] as const,
    ),
  );
}

async function fetchInvitationLabels(serviceClient: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, AuditEntityLabel>();
  const { data, error } = await serviceClient
    .from("invitations")
    .select("id, first_name, last_name, email")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    ((data ?? []) as AuditRow[]).map(
      (row) =>
        [
          String(row.id),
          {
            name: fullName(row.first_name, row.last_name),
            email: stringOrNull(row.email),
          },
        ] as const,
    ),
  );
}

async function fetchOrganizationLabels(serviceClient: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, AuditEntityLabel>();
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    ((data ?? []) as AuditRow[]).map(
      (row) => [String(row.id), { name: stringOrNull(row.name), email: null }] as const,
    ),
  );
}

function resolveTargetIdentity(input: {
  details: Record<string, unknown>;
  resourceType: string;
  resourceId: string | null;
  profileLabels: Map<string, AuditEntityLabel>;
  employeeLabels: Map<string, AuditEntityLabel>;
  invitationLabels: Map<string, AuditEntityLabel>;
  organizationLabels: Map<string, AuditEntityLabel>;
}) {
  const detailIdentity = detailTargetIdentity(input.details);
  if (!input.resourceId) {
    return {
      targetLabel: detailIdentity.name,
      targetEmail: detailIdentity.email,
    };
  }

  let entity: AuditEntityLabel | undefined;
  if (input.resourceType === "employee") {
    entity = input.employeeLabels.get(input.resourceId);
  } else if (input.resourceType === "user" || input.resourceType === "organization_membership") {
    entity = input.profileLabels.get(input.resourceId);
  } else if (input.resourceType === "invitation") {
    entity = input.invitationLabels.get(input.resourceId);
  } else if (input.resourceType === "organization") {
    entity = input.organizationLabels.get(input.resourceId);
  }

  return {
    targetLabel: entity?.name ?? detailIdentity.name ?? entity?.email ?? detailIdentity.email,
    targetEmail: entity?.email ?? detailIdentity.email,
  };
}

function detailTargetIdentity(details: Record<string, unknown>): AuditEntityLabel {
  const email =
    stringOrNull(details.targetEmail ?? details.target_email) ?? stringOrNull(details.email);
  const name =
    stringOrNull(details.targetName) ??
    fullName(
      details.targetFirstName ?? details.target_first_name,
      details.targetLastName ?? details.target_last_name,
    ) ??
    fullName(details.firstName ?? details.first_name, details.lastName ?? details.last_name) ??
    stringOrNull(details.name);
  return { name, email };
}

function fullName(first: unknown, last: unknown) {
  const value = [stringOrNull(first), stringOrNull(last)].filter(Boolean).join(" ").trim();
  return value || null;
}

export function recordOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
