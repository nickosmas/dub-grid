import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { getServiceClient } from "@/lib/supabase-service";
import { membershipRowToOrganizationUser } from "@/lib/db/mappers";
import type { DbOrganizationMembership } from "@/lib/db/types";
import type { OrganizationUser, PlatformRole } from "@/types";
import { API_ERRORS } from "@dubgrid/client-errors";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

async function fetchOrganizationUserRows(orgId: string): Promise<OrganizationUser[]> {
  const serviceClient = getServiceClient();
  const { data: memberships, error } = await serviceClient
    .from("organization_memberships")
    .select(
      "id, user_id, org_id, org_role, admin_permissions, joined_at, updated_at, archived_at, archived_by, department_ids, dept_admin_ids, phone, onboarding_completed_at, tooltip_tours_completed",
    )
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (error) throw error;

  const membershipRows = (memberships ?? []) as DbOrganizationMembership[];
  const userIds = membershipRows.map((membership) => membership.user_id);

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
        platformRole: (profile.platform_role as PlatformRole | null) ?? "none",
        createdAt: (profile.created_at as string | null) ?? null,
      },
    ]),
  );
  const visibleMemberships = membershipRows.filter(
    (membership) => (profiles.get(membership.user_id)?.platformRole ?? "none") !== "gridmaster",
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

  return visibleMemberships.map((membership) =>
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
    const parsed = searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const orgAuth = await requireOrgPermissions(req, parsed.data.orgId, () => true);
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    // Use the auth-effective orgId so sandbox callers see their
    // sandbox's users, not the real organization's users.
    const users = await fetchOrganizationUserRows(orgAuth.orgId);
    return NextResponse.json({ users });
  } catch (error) {
    console.error("organization users GET failed", error);
    return NextResponse.json({ error: "Failed to load organization users" }, { status: 500 });
  }
}
