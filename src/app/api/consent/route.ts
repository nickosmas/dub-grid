import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

const consentSchema = z.object({
  consent: z.object({
    essential: z.literal(true),
    analytics: z.boolean(),
  }),
  version: z.string().min(1).max(20),
});

function getUserClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    },
  );
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/consent
 * Records a cookie consent decision to the database for GDPR audit trail.
 * Works for both authenticated and anonymous visitors.
 */
export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Get authenticated user if available (nullable for anonymous visitors)
    const userClient = getUserClient(req);
    const { data: { user: authedUser } } = await userClient.auth.getUser();

    // Hash IP for privacy-safe audit trail
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex");

    const userAgent = req.headers.get("user-agent") || null;

    const serviceClient = getServiceClient();
    const { error } = await serviceClient.from("cookie_consents").insert({
      user_id: authedUser?.id || null,
      ip_hash: ipHash,
      consent: parsed.data.consent,
      consent_version: parsed.data.version,
      user_agent: userAgent,
    });

    if (error) {
      logger.error({ error }, "Failed to record consent");
      return NextResponse.json({ error: "Failed to record consent" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ error: err }, "Consent recording failed");
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 });
  }
}
