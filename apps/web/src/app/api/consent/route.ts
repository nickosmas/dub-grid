import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServiceClient } from "@/lib/supabase-service";
import { createHmac } from "crypto";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/lib/supabase-keys";
import { extractBearerToken, verifyAccessToken } from "@/lib/auth/verify-token";
import { serverEnv } from "@/lib/env.server";
import { checkRateLimit, consentIpLimiter, consentUserLimiter } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";

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
 * Attribute the consent to a signed-in user when there is one, and stay
 * anonymous otherwise. The native app sends no cookies, so its Bearer token
 * comes first; when one is sent it alone decides, so a bad token never falls
 * through to someone else's browser session. Verified locally against
 * Supabase's JWKS rather than with a getUser() round trip; an unverifiable
 * token just means the visitor is recorded as anonymous.
 */
async function resolveConsentUser(req: NextRequest): Promise<{ id: string } | null> {
  let token = extractBearerToken(req);
  if (!token) {
    const {
      data: { session },
    } = await getUserClient(req).auth.getSession();
    token = session?.access_token ?? null;
  }
  const verified = token ? await verifyAccessToken(token) : null;
  return verified ? { id: verified.userId } : null;
}

/** Stored instead of a hash when no key is configured: never the plain hash. */
const IP_HASH_UNAVAILABLE = "unavailable";

/**
 * Keyed, so a record's hash can't be reversed by hashing all ~4 billion IPv4
 * addresses, which is all an unkeyed SHA-256 takes.
 */
function hashConsentIp(ip: string): string {
  const secret = serverEnv?.CONSENT_IP_HASH_SECRET;
  if (!secret) {
    logger.error("CONSENT_IP_HASH_SECRET is not set; consent recorded without an IP hash");
    return IP_HASH_UNAVAILABLE;
  }
  return createHmac("sha256", secret).update(ip).digest("hex");
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

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

    const authedUser = await resolveConsentUser(req);

    // A signed-in person is limited on their own, so a shared office address
    // never runs out for the people behind it.
    const { limited, reset, misconfigured } = authedUser
      ? await checkRateLimit(consentUserLimiter, `consent:user:${authedUser.id}`)
      : await checkRateLimit(consentIpLimiter, `consent:ip:${ip}`);
    if (misconfigured) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: API_ERRORS.RATE_LIMITED },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
      );
    }

    const ipHash = hashConsentIp(ip);

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

    // The client keeps who the record names, so it knows when to record again.
    return NextResponse.json({ success: true, userId: authedUser?.id ?? null });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "consent" } });
    logger.error({ error: err }, "Consent recording failed");
    return NextResponse.json(
      { error: "We couldn't save your choices. Try again." },
      { status: 500 },
    );
  }
}
