import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { fetchFilteredAuditRows } from "@/lib/audit/server-query";

type ServiceClient = ReturnType<typeof getServiceClient>;
type AuditRow = Record<string, unknown>;

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  actionPrefix: z.string().min(1).optional(),
  // Comma-separated prefixes, OR'd. A single category can span several
  // ("Setup" covers focus_area., job., shift_category., …), and filtering
  // client-side after a paged fetch would drop rows out of the page.
  actionPrefixes: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter((part) => /^[a-z0-9_]+\.$/.test(part))
        : undefined,
    ),
  resourceType: z.string().min(1).optional(),
  actorId: z.string().uuid().optional(),
  target: z.string().min(1).max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  highRiskOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
      action: req.nextUrl.searchParams.get("action") ?? undefined,
      actionPrefix: req.nextUrl.searchParams.get("actionPrefix") ?? undefined,
      actionPrefixes: req.nextUrl.searchParams.get("actionPrefixes") ?? undefined,
      resourceType: req.nextUrl.searchParams.get("resourceType") ?? undefined,
      actorId: req.nextUrl.searchParams.get("actorId") ?? undefined,
      target: req.nextUrl.searchParams.get("target") ?? undefined,
      startDate: req.nextUrl.searchParams.get("startDate") ?? undefined,
      endDate: req.nextUrl.searchParams.get("endDate") ?? undefined,
      highRiskOnly: req.nextUrl.searchParams.get("highRiskOnly") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const serviceClient = parsed.data.orgId
      ? await authorizeOrgAuditLogAccess(req, parsed.data.orgId)
      : await authorizePlatformAuditLogAccess(req);
    if ("response" in serviceClient) {
      return serviceClient.response;
    }

    const rows = await fetchFilteredAuditRows(serviceClient, parsed.data);
    const entries = await enrichAuditRows(serviceClient, rows);

    return NextResponse.json({
      entries,
    });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/audit-log/full" },
      "gridmaster full audit-log GET failed",
    );
    return NextResponse.json(
      { error: "We couldn't load the activity log. Refresh and try again." },
      { status: 500 },
    );
  }
}

async function authorizeOrgAuditLogAccess(req: NextRequest, orgId: string) {
  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
  );
  if ("response" in auth) {
    return { response: auth.response };
  }
  return auth.serviceClient;
}

async function authorizePlatformAuditLogAccess(req: NextRequest) {
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) {
    return { response: auth.response };
  }
  return getServiceClient();
}

async function enrichAuditRows(serviceClient: ServiceClient, rows: AuditRow[]) {
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
      id: row.id as number,
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

type AuditEntityLabel = {
  name: string | null;
  email: string | null;
};

async function fetchProfileLabels(serviceClient: ServiceClient, ids: string[]) {
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

async function fetchEmployeeLabels(serviceClient: ServiceClient, ids: string[]) {
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

async function fetchInvitationLabels(serviceClient: ServiceClient, ids: string[]) {
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

async function fetchOrganizationLabels(serviceClient: ServiceClient, ids: string[]) {
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

function recordOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
