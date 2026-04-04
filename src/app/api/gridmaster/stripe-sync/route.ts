import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { z } from "zod";
import { syncSubscriptionToDb } from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  orgId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  // Auth
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } },
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Gridmaster check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  type Claims = { platform_role?: unknown };
  let claims: Claims | null = null;
  if (supabaseUrl) {
    try {
      const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jwtVerify(session.access_token, jwks);
      claims = payload as Claims;
    } catch {}
  }
  if (!claims) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    try { claims = decodeJwt(session.access_token) as Claims; } catch { return NextResponse.json({ error: "Invalid session" }, { status: 401 }); }
  }
  if (claims!.platform_role !== "gridmaster") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Input
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await syncSubscriptionToDb(parsed.data.orgId);

    // Audit
    try {
      const admin = getServiceClient();
      await admin.from("audit_log").insert({
        org_id: parsed.data.orgId,
        actor_id: session.user.id,
        actor_email: session.user.email ?? null,
        action: "billing.synced",
        resource_type: "organization",
        resource_id: parsed.data.orgId,
        details: { initiated_by: "gridmaster" },
      });
    } catch (e) { logger.error({ err: e }, "Failed to audit billing sync"); }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-stripe-sync" } });
    logger.error({ err, path: "/api/gridmaster/stripe-sync" }, "Stripe sync failed");
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
