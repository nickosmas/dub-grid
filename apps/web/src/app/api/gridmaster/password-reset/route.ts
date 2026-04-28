import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { passwordResetLimiter, checkRateLimit } from "@/lib/rate-limit";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // ── Rate limit by user ID ────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(
    passwordResetLimiter,
    user.id,
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
        actor_id: user.id,
        actor_email: user.email ?? null,
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
