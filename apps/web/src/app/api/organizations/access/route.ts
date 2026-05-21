import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { buildMembershipAccessChanges, buildMembershipRemovalChanges } from "@/lib/access-management";
import { membershipRowToOrganizationUser } from "@/lib/db/mappers";
import type { DbOrganizationMembership } from "@/lib/db/types";
import type { AdminPermissions, OrganizationUser, PlatformRole } from "@/types";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";

export const dynamic = "force-dynamic";

const adminPermissionsSchema = z.record(z.string(), z.boolean());

const patchSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  orgRole: z.enum(["super_admin", "admin", "user"]).optional(),
  adminPermissions: adminPermissionsSchema.nullable().optional(),
});

const deleteSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

function timestampsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

async function requirePrivilegedActor(
  req: NextRequest,
  orgId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
  );
  if ("response" in auth) {
    return { ok: false, response: auth.response };
  }

  return { ok: true };
}

async function fetchOrganizationUser(
  orgId: string,
  userId: string,
): Promise<OrganizationUser | null> {
  const serviceClient = getServiceClient();
  const { data: membership, error } = await serviceClient
    .from("organization_memberships")
    .select("id, user_id, org_id, org_role, admin_permissions, joined_at, updated_at, archived_at, archived_by, department_ids, dept_admin_ids, phone, onboarding_completed_at, tooltip_tours_completed")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  if (!membership) return null;

  const [{ data: profile }, authResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("first_name, last_name, platform_role, created_at")
      .eq("id", userId)
      .maybeSingle(),
    serviceClient.auth.admin.getUserById(userId),
  ]);

  if (profile?.platform_role === "gridmaster") {
    return null;
  }

  return membershipRowToOrganizationUser(
    membership as DbOrganizationMembership,
    {
      email: authResult.data.user?.email ?? null,
      firstName: (profile?.first_name as string | null) ?? null,
      lastName: (profile?.last_name as string | null) ?? null,
      platformRole: ((profile?.platform_role as PlatformRole | null) ?? "none"),
      createdAt: (profile?.created_at as string | null) ?? null,
      lastSignInAt: authResult.data.user?.last_sign_in_at ?? null,
    },
  );
}

function buildConflictResponse(latestUser: OrganizationUser) {
  return NextResponse.json(
    {
      error:
        "Organization access changed elsewhere. Review the latest values before saving again.",
      code: "ORG_ACCESS_CONFLICT",
      user: latestUser,
    },
    { status: 409 },
  );
}

async function writeAuditEntry(input: {
  orgId: string;
  actorId: string;
  actorEmail: string | null;
  resourceId: string;
  action: string;
  changes: ReturnType<typeof buildMembershipAccessChanges>;
  req: NextRequest;
}) {
  const serviceClient = getServiceClient();
  const { error } = await serviceClient.from("audit_log").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    actor_email: input.actorEmail,
    action: input.action,
    resource_type: "organization_membership",
    resource_id: input.resourceId,
    details: {
      changedFields: input.changes.map((change) => change.key),
      changes: input.changes.map((change) => ({
        field: change.key,
        label: change.label,
        from: change.previousValue,
        to: change.nextValue,
      })),
    },
    ip_address: getRequestIp(input.req),
    user_agent: input.req.headers.get("user-agent"),
  });

  if (error) {
    logger.error(
      { error, orgId: input.orgId, resourceId: input.resourceId },
      "Organization access audit log write failed",
    );
  }
}

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { orgId, userId, expectedUpdatedAt, orgRole, adminPermissions } = parsed.data;

  try {
    const allowed = await requirePrivilegedActor(req, orgId);
    if (!allowed.ok) return allowed.response;

    const currentUser = await fetchOrganizationUser(orgId, userId);
    if (!currentUser) {
      return NextResponse.json({ error: "User membership not found" }, { status: 404 });
    }

    if (!timestampsMatch(currentUser.updatedAt, expectedUpdatedAt)) {
      return buildConflictResponse(currentUser);
    }

    const nextRole = orgRole ?? currentUser.orgRole;
    const nextPermissions =
      nextRole === "admin"
        ? (adminPermissions !== undefined
            ? (adminPermissions as AdminPermissions | null)
            : currentUser.adminPermissions)
        : null;

    const changes = buildMembershipAccessChanges(currentUser, {
      orgRole: nextRole,
      adminPermissions: nextPermissions,
    });

    if (changes.length === 0) {
      return NextResponse.json({ success: true, user: currentUser });
    }

    const serviceClient = getServiceClient();

    if (currentUser.orgRole !== nextRole) {
      const { error } = await serviceClient.rpc("change_user_role", {
        p_target_user_id: userId,
        p_new_role: nextRole,
        p_changed_by_id: user.id,
        p_idempotency_key: `${userId}-${nextRole}-${Date.now()}`,
        p_org_id: orgId,
        p_expected_updated_at: expectedUpdatedAt,
      });

      if (error) {
        const latestUser = await fetchOrganizationUser(orgId, userId);
        if (latestUser && !timestampsMatch(latestUser.updatedAt, expectedUpdatedAt)) {
          return buildConflictResponse(latestUser);
        }
        throw error;
      }
    }

    const latestAfterRole = await fetchOrganizationUser(orgId, userId);
    if (!latestAfterRole) {
      return NextResponse.json({ error: "User membership not found" }, { status: 404 });
    }

    if (!timestampsMatch(latestAfterRole.updatedAt, expectedUpdatedAt) && currentUser.orgRole === nextRole) {
      return buildConflictResponse(latestAfterRole);
    }

    const permissionsChanged =
      JSON.stringify(currentUser.adminPermissions ?? null) !== JSON.stringify(nextPermissions ?? null);

    if (permissionsChanged) {
      const { data: updatedMembership, error } = await serviceClient
        .from("organization_memberships")
        .update({ admin_permissions: nextPermissions })
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("updated_at", latestAfterRole.updatedAt)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!updatedMembership) {
        const latestUser = await fetchOrganizationUser(orgId, userId);
        if (latestUser) return buildConflictResponse(latestUser);
      }
    }

    const latestUser = await fetchOrganizationUser(orgId, userId);
    if (!latestUser) {
      return NextResponse.json({ error: "User membership not found" }, { status: 404 });
    }

    await writeAuditEntry({
      orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      resourceId: userId,
      action: "organization_access.updated",
      changes,
      req,
    });

    if (permissionsChanged) {
      void dispatchNotificationEvent(user.id, {
        action: "admin_permissions_changed",
        orgId,
        targetUserId: userId,
        before: (currentUser.adminPermissions ?? null) as
          | Record<string, boolean>
          | null,
        after: (nextPermissions ?? null) as Record<string, boolean> | null,
      });
    }

    return NextResponse.json({ success: true, user: latestUser });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "organizations/access", orgId, userId } });
    logger.error({ error: err, orgId, userId }, "Organization access update failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { orgId, userId, expectedUpdatedAt } = parsed.data;

  try {
    const allowed = await requirePrivilegedActor(req, orgId);
    if (!allowed.ok) return allowed.response;

    const currentUser = await fetchOrganizationUser(orgId, userId);
    if (!currentUser) {
      return NextResponse.json({ error: "User membership not found" }, { status: 404 });
    }

    if (!timestampsMatch(currentUser.updatedAt, expectedUpdatedAt)) {
      return buildConflictResponse(currentUser);
    }

    const serviceClient = getServiceClient();

    if (currentUser.orgRole === "super_admin") {
      const { count, error } = await serviceClient
        .from("organization_memberships")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("org_role", "super_admin")
        .is("archived_at", null);

      if (error) throw error;
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the only super admin. Transfer ownership first." },
          { status: 400 },
        );
      }
    }

    const { data: updatedMembership, error } = await serviceClient
      .from("organization_memberships")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
      })
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("updated_at", expectedUpdatedAt)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!updatedMembership) {
      const latestUser = await fetchOrganizationUser(orgId, userId);
      if (latestUser) return buildConflictResponse(latestUser);
      return NextResponse.json({ error: "User membership not found" }, { status: 404 });
    }

    await writeAuditEntry({
      orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      resourceId: userId,
      action: "user.removed_from_org",
      changes: buildMembershipRemovalChanges(currentUser),
      req,
    });

    void dispatchNotificationEvent(user.id, {
      action: "membership_removed",
      orgId,
      removedUserId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "organizations/access", orgId, userId } });
    logger.error({ error: err, orgId, userId }, "Organization access removal failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
