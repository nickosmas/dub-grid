import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { membershipRowToOrganizationUser } from "@/lib/db/mappers";
import type { DbOrganizationMembership } from "@/lib/db/types";
import type { OrganizationUser, PlatformRole } from "@/types";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

async function canViewOrganizationUsers(
  actorId: string,
  orgId: string,
  claims: Record<string, unknown>,
): Promise<boolean> {
  if (claims.platform_role === "gridmaster") {
    return true;
  }

  if (claims.org_id === orgId) {
    return true;
  }

  const serviceClient = getServiceClient();
  const { data: membership } = await serviceClient
    .from("organization_memberships")
    .select("user_id")
    .eq("user_id", actorId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  return !!membership;
}

async function fetchOrganizationUserRows(
  orgId: string,
): Promise<OrganizationUser[]> {
  const serviceClient = getServiceClient();
  const { data: memberships, error } = await serviceClient
    .from("organization_memberships")
    .select(
      "id, user_id, org_id, org_role, admin_permissions, joined_at, updated_at, archived_at, archived_by, department_ids, dept_admin_ids, phone, onboarding_completed_at, tooltip_tours_completed",
    )
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (error) throw error;

  const userIds = ((memberships ?? []) as DbOrganizationMembership[]).map(
    (membership) => membership.user_id,
  );

  const [profilesResult, authUsersResult] = await Promise.all([
    userIds.length > 0
      ? serviceClient
          .from("profiles")
          .select("id, first_name, last_name, platform_role, created_at")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(userIds.map((userId) => serviceClient.auth.admin.getUserById(userId))),
  ]);

  if (profilesResult.error) throw profilesResult.error;

  const profiles = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id as string,
      {
        firstName: (profile.first_name as string | null) ?? null,
        lastName: (profile.last_name as string | null) ?? null,
        platformRole: ((profile.platform_role as PlatformRole | null) ?? "none"),
        createdAt: (profile.created_at as string | null) ?? null,
      },
    ]),
  );

  const authUsers = new Map(
    authUsersResult.map((result) => [
      result.data.user?.id ?? "",
      {
        email: result.data.user?.email ?? null,
        lastSignInAt: result.data.user?.last_sign_in_at ?? null,
      },
    ]),
  );

  return ((memberships ?? []) as DbOrganizationMembership[]).map((membership) =>
    membershipRowToOrganizationUser(membership, {
      email: authUsers.get(membership.user_id)?.email ?? null,
      firstName: profiles.get(membership.user_id)?.firstName ?? null,
      lastName: profiles.get(membership.user_id)?.lastName ?? null,
      platformRole: profiles.get(membership.user_id)?.platformRole ?? "none",
      createdAt: profiles.get(membership.user_id)?.createdAt ?? null,
      lastSignInAt: authUsers.get(membership.user_id)?.lastSignInAt ?? null,
    }),
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    const parsed = searchSchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const allowed = await canViewOrganizationUsers(
      auth.user.id,
      parsed.data.orgId,
      auth.claims,
    );
    if (!allowed) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const users = await fetchOrganizationUserRows(parsed.data.orgId);
    return NextResponse.json({ users });
  } catch (error) {
    console.error("organization users GET failed", error);
    return NextResponse.json(
      { error: "Failed to load organization users" },
      { status: 500 },
    );
  }
}
