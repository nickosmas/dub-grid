import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
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

    const result = await getServiceClient().rpc("get_all_users_with_profiles");
    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({
      users: (result.data ?? []).map((row: Record<string, unknown>) =>
        mapPlatformUser(row),
      ),
    });
  } catch (error) {
    console.error("gridmaster users GET failed", error);
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = activationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { userId, deactivate } = parsed.data;
    const { error } = await getServiceClient()
      .from("profiles")
      .update({
        deactivated_at: deactivate ? new Date().toISOString() : null,
        deactivated_by: deactivate ? auth.user.id : null,
      })
      .eq("id", userId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("gridmaster users PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update user status" },
      { status: 500 },
    );
  }
}
