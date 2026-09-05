import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServiceClient } from "@/lib/supabase-service";
import { createHash } from "crypto";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/lib/supabase-keys";
import { verifyAccessToken } from "@/lib/auth/verify-token";

export const dynamic = "force-dynamic";

const consentSchema = z.object({
  consent: z.object({
    essential: z.literal(true),
    analytics: z.boolean(),
  }),
  version: z.string().min(1).max(20),
});

function getUserClient(req: NextRequest) {
  return createServerClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
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
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    // Attribute the consent to a signed-in user when there is one, and stay
    // anonymous otherwise. Verified locally against Supabase's JWKS rather
    // than with a getUser() round trip — an unverifiable token just means the
    // visitor is recorded as anonymous, which is the same outcome as before.
    const userClient = getUserClient(req);
    const {
      data: { session },
    } = await userClient.auth.getSession();
    const verified = session?.access_token ? await verifyAccessToken(session.access_token) : null;
    const authedUser = verified ? { id: verified.userId } : null;

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
      return NextResponse.json(
        { error: "We couldn't save your choices. Try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "consent" } });
    logger.error({ error: err }, "Consent recording failed");
    return NextResponse.json(
      { error: "We couldn't save your choices. Try again." },
      { status: 500 },
    );
  }
}
