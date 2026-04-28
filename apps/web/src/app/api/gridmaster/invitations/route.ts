import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";

const querySchema = z.object({
  orgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { data, error } = await getServiceClient()
      .from("invitations")
      .select("id, org_id, email, role_to_assign, invited_by, token, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id")
      .eq("org_id", parsed.data.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ invitations: data ?? [] });
  } catch (error) {
    console.error("gridmaster invitations GET failed", error);
    return NextResponse.json(
      { error: "Failed to load invitations" },
      { status: 500 },
    );
  }
}
