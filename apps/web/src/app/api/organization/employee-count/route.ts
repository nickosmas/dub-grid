import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-service";
import { requireAuthenticatedUser } from "@/lib/api-auth";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const parsed = searchSchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const { count, error } = await serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", parsed.data.orgId)
      .is("archived_at", null);

    if (error) throw error;

    return NextResponse.json({ employeeCount: count ?? 0 });
  } catch (error) {
    console.error("organization employee count GET failed", error);
    return NextResponse.json(
      { error: "Failed to load employee count" },
      { status: 500 },
    );
  }
}
