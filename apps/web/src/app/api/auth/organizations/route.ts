import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { API_ERRORS } from "@dubgrid/client-errors";

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
      return NextResponse.json({ error: "Unable to verify organization access." }, { status: 403 });
    }

    return NextResponse.json({
      organizations: result.data ?? [],
    });
  } catch (error) {
    logger.error({ error }, "auth organizations GET failed");
    return NextResponse.json({ error: "Failed to load organizations" }, { status: 500 });
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
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = switchOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("switch_org", {
      target_org_id: parsed.data.targetOrgId,
    });

    if (result.error) {
      return NextResponse.json({ error: "Failed to switch organization." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "auth organizations POST failed");
    return NextResponse.json({ error: "Failed to switch organization" }, { status: 500 });
  }
}
