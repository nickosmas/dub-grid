import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { z } from "zod";
import { passwordResetLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Route handler — cookies are read-only here
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthenticated" },
      { status: 401 },
    );
  }

  // ── Rate limit by user ID ────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(
    passwordResetLimiter,
    session.user.id,
  );
  if (misconfigured) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }
  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  // ── CSRF: validate Origin header ────────────────────────────────────
  const origin = req.headers.get("origin");
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null);
  if (!origin || !siteUrl) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
  } else {
    const allowedHost = new URL(
      siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`,
    ).host;
    const originHost = new URL(origin).host;
    if (originHost !== allowedHost && !originHost.endsWith(`.${allowedHost}`)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
  }

  // ── Authorization — gridmaster only ─────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  type JwtClaims = { platform_role?: unknown };
  let claims: JwtClaims | null = null;

  if (supabaseUrl) {
    try {
      const jwks = createRemoteJWKSet(
        new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
      );
      const { payload } = await jwtVerify(session.access_token, jwks);
      claims = payload as JwtClaims;
    } catch {
      // jwtVerify can fail in dev (JWKS unavailable) — fall through to unverified decode
    }
  }

  if (!claims) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: supabaseUrl ? "Invalid session" : "Server misconfigured" },
        { status: supabaseUrl ? 401 : 500 },
      );
    }
    try {
      claims = decodeJwt(session.access_token) as JwtClaims;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid session" },
        { status: 401 },
      );
    }
  }

  if (claims!.platform_role !== "gridmaster") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 },
    );
  }

  // ── Input validation ────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  // ── Generate password reset link via Supabase Admin API ─────────────
  try {
    const supabaseAdmin = getServiceClient();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error) {
      logger.error(
        { err: error, path: "/api/gridmaster/password-reset" },
        "Supabase Admin generateLink failed",
      );
      return NextResponse.json(
        { success: false, error: "Failed to send password reset" },
        { status: 500 },
      );
    }

    // ── Audit log ───────────────────────────────────────────────────────
    // Best-effort audit via service client (server-side, not browser supabase)
    try {
      await supabaseAdmin.from("audit_log").insert({
        org_id: null,
        actor_id: session.user.id,
        actor_email: session.user.email ?? null,
        action: "user.password_reset_sent",
        resource_type: "user",
        resource_id: data.user?.id ?? null,
        details: { target_email: email, initiated_by: "gridmaster" },
      });
    } catch (auditErr) {
      logger.error(
        { err: auditErr, path: "/api/gridmaster/password-reset" },
        "Failed to write audit log for password reset",
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-password-reset" } });
    logger.error(
      { err, path: "/api/gridmaster/password-reset" },
      "Password reset failed",
    );
    return NextResponse.json(
      { success: false, error: "Failed to send password reset" },
      { status: 500 },
    );
  }
}
