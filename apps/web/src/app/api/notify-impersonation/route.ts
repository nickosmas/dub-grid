import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createElement } from "react";
import { render } from "@react-email/components";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { ImpersonationNoticeEmail } from "@/emails/ImpersonationNoticeEmail";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getSupabaseSecretKey, requireSupabaseUrl } from "@/lib/supabase-keys";
import { serverEnv } from "@/lib/env.server";

const bodySchema = z.object({
  targetEmail: z.string().email(),
  targetOrgName: z.string().trim().max(200).optional(),
  type: z.enum(["start", "end"]),
  sessionId: z.string().uuid(),
  justification: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth check ──────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;
  const { user, claims } = auth;

  // ── Rate limit ────────────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.SERVICE_UNAVAILABLE },
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

  // ── Authorization — only gridmaster can trigger impersonation notifications ──
  if (claims.platform_role !== "gridmaster") {
    return NextResponse.json(
      { success: false, error: API_ERRORS.GRIDMASTER_ONLY },
      { status: 403 },
    );
  }

  // ── Config check ──────────────────────────────────────────────────
  const apiKey = serverEnv?.RESEND_API_KEY;
  const fromEmail = serverEnv?.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Email service not configured" },
      { status: 500 },
    );
  }

  // ── Input validation ──────────────────────────────────────────────
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

  const { targetEmail, targetOrgName, type, justification } = parsed.data;

  const isStart = type === "start";
  const subject = isStart
    ? `Account access notice: ${targetOrgName || "DubGrid"}`
    : `Account access ended: ${targetOrgName || "DubGrid"}`;

  const html = await render(
    createElement(ImpersonationNoticeEmail, {
      orgName: targetOrgName,
      ended: !isStart,
      reason: isStart ? justification : undefined,
      logoUrl: emailBaseUrl(),
    }),
  );

  try {
    await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: targetEmail,
      subject: sanitizeHeaderValue(subject),
      html,
    });

    // ── Capture server-verified IP on the impersonation session ────────
    // On "start" notifications, update the session record with the real IP
    // from x-forwarded-for. This is more reliable than client-reported IP.
    if (isStart) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const serviceRoleKey = getSupabaseSecretKey();
      if (ip && serviceRoleKey) {
        try {
          const supabaseAdmin = createClient(requireSupabaseUrl(), serviceRoleKey);
          await supabaseAdmin
            .from("impersonation_sessions")
            .update({ ip_address: ip })
            .eq("session_id", parsed.data.sessionId);
        } catch {
          // Best-effort — IP capture failure should not break the notification flow
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "notify-impersonation" } });
    logger.error(
      { err, path: "/api/notify-impersonation" },
      "Failed to send impersonation notification email",
    );
    return NextResponse.json(
      { success: false, error: "We couldn't send that email. Try again." },
      { status: 500 },
    );
  }
}
