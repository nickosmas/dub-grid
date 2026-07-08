import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import type { UserMembership, OrganizationRole } from "@/types";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", parsed.data.userId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (profile?.platform_role === "gridmaster") {
      return NextResponse.json({ memberships: [] });
    }

    const { data, error } = await serviceClient
      .from("organization_memberships")
      .select(
        "org_id, org_role, joined_at, updated_at, admin_permissions, organizations(name, slug)",
      )
      .eq("user_id", parsed.data.userId)
      .is("archived_at", null);

    if (error) {
      throw error;
    }

    const memberships: UserMembership[] = (data ?? []).map((row: Record<string, unknown>) => {
      const org = row.organizations as { name?: string; slug?: string | null } | null;
      return {
        orgId: row.org_id as string,
        orgName: org?.name ?? "Unknown",
        orgSlug: org?.slug ?? null,
        orgRole: row.org_role as OrganizationRole,
        joinedAt: row.joined_at as string,
        updatedAt: (row.updated_at as string | null) ?? null,
        adminPermissions: (row.admin_permissions as UserMembership["adminPermissions"]) ?? null,
      };
    });

    return NextResponse.json({ memberships });
  } catch (error) {
    console.error("gridmaster memberships GET failed", error);
    return NextResponse.json({ error: "Failed to load memberships" }, { status: 500 });
  }
}
