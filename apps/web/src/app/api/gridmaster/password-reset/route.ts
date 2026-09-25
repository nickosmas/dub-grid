import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  passwordResetLimiter,
  emailTargetLimiter,
  checkRateLimit,
  hashEmail,
} from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { createAnonClient, requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";

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
  const { limited, reset, misconfigured } = await checkRateLimit(passwordResetLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }
  if (limited) {
    const retryAfter = retryAfterSeconds(reset);
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
    return NextResponse.json({ success: false, error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const { email } = parsed.data;

  // ── Per-target-email rate limit ───────────────────────────────────────
  // The per-actor limit above is keyed by the gridmaster; without this a single
  // gridmaster could flood one user's inbox with reset emails. Cap at 5/hour
  // per target address.
  const target = await checkRateLimit(emailTargetLimiter, `pwreset-email:${hashEmail(email)}`);
  if (target.misconfigured) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }
  if (target.limited) {
    const retryAfter = retryAfterSeconds(target.reset);
    return NextResponse.json(
      {
        success: false,
        error:
          "We've sent several reset emails to that address already. Wait a few minutes and try again.",
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Send the recovery email ─────────────────────────────────────────
  // `auth.admin.generateLink` only mints a link and never delivers it, which
  // is how this route reported success while the inbox stayed empty (F-84).
  // `resetPasswordForEmail` is what the user-facing recovery route sends
  // with, so the same Supabase template and redirect apply here.
  try {
    const origin = new URL(req.url).origin;
    const { error } = await createAnonClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    if (error) {
      logger.error(
        { err: error, path: "/api/gridmaster/password-reset" },
        "Supabase resetPasswordForEmail failed",
      );
      return NextResponse.json(
        { success: false, error: "We couldn't send that password reset email. Try again." },
        { status: 500 },
      );
    }

    // ── Audit log ───────────────────────────────────────────────────────
    // Best-effort audit via service client (server-side, not browser supabase)
    try {
      await writeGridmasterAuditLog({
        serviceClient: getServiceClient(),
        actor: user,
        action: "user.password_reset_sent",
        resourceType: "user",
        resourceId: null,
        details: { target_email: email },
        request: req,
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
    logger.error({ err, path: "/api/gridmaster/password-reset" }, "Password reset failed");
    return NextResponse.json(
      { success: false, error: "We couldn't send that password reset email. Try again." },
      { status: 500 },
    );
  }
}
