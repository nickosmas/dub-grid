import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ACCOUNT_DISABLED_CODE,
  ACCOUNT_DISABLED_MESSAGE,
  isAccountDisabledMessage,
} from "@dubgrid/domain";
import { loginLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { Timer } from "@/lib/server-timing";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * Server-side login wrapper with brute-force protection.
 * Rate-limits by SHA-256 hash of email (never stores raw email in Redis).
 */
export async function POST(req: NextRequest) {
  const timer = new Timer();
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Input validation ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: API_ERRORS.INVALID_BODY },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.INVALID_INPUT },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  // ── Rate limit by hashed email ────────────────────────────────────
  // Hash the email so we never store raw PII in Redis
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(email.toLowerCase()));
  const emailHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { limited, reset, misconfigured } = await timer.time("ratelimit", () =>
    checkRateLimit(loginLimiter, `login:${emailHash}`),
  );

  if (misconfigured) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 900;
    logger.warn({ emailHash, path: "/api/auth/login" }, "Login rate limited");
    return NextResponse.json(
      {
        success: false,
        error: "Too many login attempts. Please try again later.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Authenticate via Supabase ─────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    logger.error("Supabase env vars not configured for login route");
    Sentry.captureMessage("Supabase env vars not configured for login route", "error");
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await timer.time("signin", () =>
    supabase.auth.signInWithPassword({ email, password }),
  );

  if (error) {
    logger.info({ emailHash, path: "/api/auth/login", errorMsg: error.message }, "Login failed");
    // The JWT hook refuses terminated employees with a sentinel message
    // (ACCOUNT_DISABLED_MESSAGE). Surface that as a structured 403 so the
    // login UI can show a friendly "account disabled" modal instead of the
    // generic invalid-credentials toast.
    if (isAccountDisabledMessage(error.message)) {
      return NextResponse.json(
        {
          success: false,
          code: ACCOUNT_DISABLED_CODE,
          error: ACCOUNT_DISABLED_MESSAGE,
        },
        { status: 403 },
      );
    }
    // Return generic error to avoid email enumeration
    return NextResponse.json(
      { success: false, error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Check if user has verified TOTP factors (MFA enrolled)
  const verifiedTotpFactors = (data.user.factors ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );

  // Return the session tokens so the client can set them
  const res = NextResponse.json({
    success: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    },
    user: {
      id: data.user.id,
      email: data.user.email,
      email_confirmed_at: data.user.email_confirmed_at,
    },
    mfa_required: verifiedTotpFactors.length > 0,
  });
  timer.applyTo(res.headers);
  return res;
}
