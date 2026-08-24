import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";
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
    return NextResponse.json(
      { error: "We couldn't load your organizations. Refresh and try again." },
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
      return NextResponse.json(
        { error: "We couldn't switch organizations. Try again." },
        { status: 400 },
      );
    }

    // A sandbox must not survive the switch. The cookie is host-only and
    // path=/, and while it is set the auth layer rewrites org_id to the sandbox
    // clone and widens org_role to super_admin for every request. Left in
    // place, the user "switches to org B" and then keeps reading and writing a
    // clone of org A, at an elevated role, for up to the cookie's week-long
    // lifetime. Clearing it here (rather than relying on the client's
    // fire-and-forget exitSandbox) makes the switch itself the guarantee.
    //
    // Only the cookie is cleared, not the sandbox org: `exit` deletes the row,
    // and doing that here would silently destroy work the user never asked to
    // discard. It is re-attachable by pressing Enter again.
    const response = NextResponse.json({ success: true });
    response.cookies.set(SANDBOX_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    logger.error({ error }, "auth organizations POST failed");
    return NextResponse.json(
      { error: "We couldn't switch organizations. Try again." },
      { status: 500 },
    );
  }
}
