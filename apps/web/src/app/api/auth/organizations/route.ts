import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedSession,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

const switchOrganizationSchema = z.object({
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
        { error: "Unable to verify organization access." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      organizations: result.data ?? [],
    });
  } catch (error) {
    console.error("auth organizations GET failed", error);
    return NextResponse.json(
      { error: "Failed to load organizations" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

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

    const parsed = switchOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("switch_org", {
      target_org_id: parsed.data.targetOrgId,
    });

    if (result.error) {
      return NextResponse.json(
        { error: "Failed to switch organization." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("auth organizations POST failed", error);
    return NextResponse.json(
      { error: "Failed to switch organization" },
      { status: 500 },
    );
  }
}
