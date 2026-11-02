import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonPermissionsBodySchema,
  mobilePersonPermissionsResponseSchema,
} from "@dubgrid/contracts";
import { CONFIGURABLE_PERMISSION_KEYS, buildInitialPermissions } from "@dubgrid/authz";
import { insertMobileAuditLogEntry } from "@dubgrid/data-access";
import {
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
  changedElsewhereMessage,
} from "@dubgrid/domain";
import { requireMobileAuth } from "@/features/mobile/server";
import { loadMobilePersonWithAccess } from "@/features/mobile/server/person-access";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { buildAdminPermissionChanges } from "@/lib/access-management";
import type { AdminPermissions } from "@/types";

export const dynamic = "force-dynamic";

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

/**
 * An Admin's permissions, from the app's Permissions screen. The same bar as
 * web's access route: a Super Admin, never on their own account, against the
 * membership as they last saw it. Only the keys the editor shows are taken from
 * the request; the always-on and Super Admin-only keys keep their fixed values.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  if (!auth.permissions.canConfigureAdminPermissions || auth.permissions.isGridmaster) {
    return NextResponse.json(
      { error: "Only a Super Admin can change an Admin's permissions." },
      { status: 403 },
    );
  }

  const parsed = mobilePersonPermissionsBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the permissions and try again." }, { status: 400 });
  }

  const loaded = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
  if (!loaded) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (loaded.userId && loaded.userId === auth.user.id) {
    return NextResponse.json(
      { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
      { status: 403 },
    );
  }
  const membership = loaded.membership;
  if (!membership || membership.org_role !== "admin") {
    return NextResponse.json(
      { error: "Permissions are set for Admins who have joined." },
      { status: 400 },
    );
  }
  if ((membership.updated_at ?? null) !== parsed.data.expectedMembershipUpdatedAt) {
    return NextResponse.json(
      {
        error: changedElsewhereMessage("their access"),
        code: "ORG_ACCESS_CONFLICT",
        person: loaded.person,
      },
      { status: 409 },
    );
  }

  const current = (membership.admin_permissions ?? null) as AdminPermissions | null;
  const next = buildInitialPermissions(current);
  for (const key of CONFIGURABLE_PERMISSION_KEYS) {
    const value = parsed.data.adminPermissions[key];
    if (typeof value === "boolean") next[key] = value;
  }

  const changes = buildAdminPermissionChanges(current, next);
  if (changes.length === 0) {
    return NextResponse.json(
      mobilePersonPermissionsResponseSchema.parse({ success: true, person: loaded.person }),
    );
  }

  const { data: updated, error } = await auth.serviceClient
    .from("organization_memberships")
    .update({ admin_permissions: next })
    .eq("user_id", membership.user_id)
    .eq("org_id", auth.currentOrg.id)
    .eq("updated_at", membership.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) {
    const latest = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
    return NextResponse.json(
      {
        error: changedElsewhereMessage("their access"),
        code: "ORG_ACCESS_CONFLICT",
        person: latest?.person ?? loaded.person,
      },
      { status: 409 },
    );
  }

  await insertMobileAuditLogEntry(auth.serviceClient, {
    org_id: auth.currentOrg.id,
    actor_id: auth.user.id,
    actor_email: auth.user.email ?? null,
    action: "organization_access.updated",
    resource_type: "organization_membership",
    resource_id: membership.user_id,
    details: {
      changedFields: changes.map((change) => change.key),
      changes: changes.map((change) => ({
        field: change.key,
        label: change.label,
        from: change.previousValue,
        to: change.nextValue,
      })),
    },
    ip_address: getRequestIp(req),
    user_agent: req.headers?.get("user-agent") ?? null,
  });

  void dispatchNotificationEvent(auth.user.id, {
    action: "admin_permissions_changed",
    orgId: auth.currentOrg.id,
    targetUserId: membership.user_id,
    before: current as Record<string, boolean> | null,
    after: next as unknown as Record<string, boolean>,
  });

  const person = await loadMobilePersonWithAccess(auth.serviceClient, auth.currentOrg.id, id);
  return NextResponse.json(
    mobilePersonPermissionsResponseSchema.parse({
      success: true,
      person: person?.person ?? loaded.person,
    }),
  );
}
