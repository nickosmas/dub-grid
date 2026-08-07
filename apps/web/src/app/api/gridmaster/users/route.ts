import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { createRequestSupabaseClient, requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import type { PlatformRole, OrganizationRole } from "@dubgrid/domain";
import type { PlatformUser } from "@/types";

const activationSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  deactivate: z.boolean(),
});

function mapPlatformUser(row: Record<string, unknown>): PlatformUser {
  return {
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    firstName: null,
    lastName: null,
    platformRole: ((row.platform_role as string | null) ?? "none") as PlatformRole,
    orgRole: ((row.org_role as string | null) ?? null) as OrganizationRole | null,
    orgId: (row.org_id as string | null) ?? null,
    orgName: (row.org_name as string | null) ?? null,
    orgSlug: (row.org_slug as string | null) ?? null,
    createdAt: row.created_at as string,
    lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
    deactivatedAt: (row.deactivated_at as string | null) ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const result = await createRequestSupabaseClient(req).rpc("get_all_users_with_profiles");
    if (result.error) {
      throw result.error;
    }

    const users: PlatformUser[] = (result.data ?? [])
      .filter((row: Record<string, unknown>) => row.platform_role !== "gridmaster")
      .map((row: Record<string, unknown>) => mapPlatformUser(row));
    const userIds = users.map((user) => user.id);
    const serviceClient = getServiceClient();
    const [sessionsResult, mobileTokensResult, membershipsResult, forceLogoutResult] =
      userIds.length > 0
        ? await Promise.all([
            serviceClient
              .from("user_sessions")
              .select("user_id, last_active_at")
              .in("user_id", userIds),
            serviceClient
              .from("mobile_device_tokens")
              .select("user_id, disabled_at")
              .in("user_id", userIds),
            serviceClient
              .from("organization_memberships")
              .select("user_id, archived_at")
              .in("user_id", userIds),
            serviceClient
              .from("audit_log")
              .select("resource_id, created_at")
              .eq("action", "user.force_logout")
              .in("resource_id", userIds)
              .order("created_at", { ascending: false }),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
    for (const extraResult of [
      sessionsResult,
      mobileTokensResult,
      membershipsResult,
      forceLogoutResult,
    ]) {
      if (extraResult.error) throw extraResult.error;
    }
    const dayAgo = Date.now() - 86_400_000;
    const activeSessionsByUser = countBy(
      (sessionsResult.data ?? []).filter(
        (row: Record<string, unknown>) => Date.parse(String(row.last_active_at ?? "")) >= dayAgo,
      ) as Record<string, unknown>[],
      "user_id",
    );
    const mobileDevicesByUser = countBy(
      (mobileTokensResult.data ?? []).filter(
        (row: Record<string, unknown>) => !row.disabled_at,
      ) as Record<string, unknown>[],
      "user_id",
    );
    const membershipsByUser = countBy(
      (membershipsResult.data ?? []).filter(
        (row: Record<string, unknown>) => !row.archived_at,
      ) as Record<string, unknown>[],
      "user_id",
    );
    const lastForceLogoutByUser = new Map<string, string>();
    for (const row of (forceLogoutResult.data ?? []) as Record<string, unknown>[]) {
      const userId = typeof row.resource_id === "string" ? row.resource_id : null;
      if (userId && !lastForceLogoutByUser.has(userId)) {
        lastForceLogoutByUser.set(userId, String(row.created_at ?? ""));
      }
    }

    return NextResponse.json({
      users: users.map((user: PlatformUser) => ({
        ...user,
        membershipCount: membershipsByUser.get(user.id) ?? 0,
        activeSessionCount: activeSessionsByUser.get(user.id) ?? 0,
        mobileDeviceCount: mobileDevicesByUser.get(user.id) ?? 0,
        lastForceLogoutAt: lastForceLogoutByUser.get(user.id) ?? null,
      })),
    });
  } catch (error) {
    logger.error({ error }, "gridmaster users GET failed");
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

function countBy(rows: Record<string, unknown>[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = typeof row[key] === "string" ? row[key] : null;
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = activationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const { userId, deactivate } = parsed.data;
    const serviceClient = getServiceClient();
    const { error } = await serviceClient
      .from("profiles")
      .update({
        deactivated_at: deactivate ? new Date().toISOString() : null,
        deactivated_by: deactivate ? auth.user.id : null,
      })
      .eq("id", userId);

    if (error) {
      throw error;
    }

    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: deactivate ? "user.deactivated" : "user.reactivated",
      resourceType: "user",
      resourceId: userId,
      orgId: parsed.data.orgId,
      details: { targetUserId: userId },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "gridmaster users PATCH failed");
    return NextResponse.json({ error: "Failed to update user status" }, { status: 500 });
  }
}
