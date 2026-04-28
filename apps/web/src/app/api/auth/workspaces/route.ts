import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedSession,
} from "@/lib/api-auth";

const switchWorkspaceSchema = z.object({
  targetOrgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("get_my_organizations");
    if (result.error) {
      return NextResponse.json(
        { error: "Unable to verify workspace access." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      organizations: result.data ?? [],
    });
  } catch (error) {
    console.error("auth workspaces GET failed", error);
    return NextResponse.json(
      { error: "Failed to load workspaces" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = switchWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("switch_org", {
      target_org_id: parsed.data.targetOrgId,
    });

    if (result.error) {
      return NextResponse.json(
        { error: "Failed to switch workspace." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("auth workspaces POST failed", error);
    return NextResponse.json(
      { error: "Failed to switch workspace" },
      { status: 500 },
    );
  }
}
