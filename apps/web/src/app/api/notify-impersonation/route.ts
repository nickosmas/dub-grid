import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createElement } from "react";
import { render } from "@react-email/components";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireGridmasterSession } from "@/lib/api-auth";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { ImpersonationNoticeEmail } from "@/emails/ImpersonationNoticeEmail";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getServiceClient } from "@/lib/supabase-service";
import { serverEnv } from "@/lib/env.server";

// Only the session and the event. Who receives the notice and what it says are
// read from that session, never from the request (finding F-25).
const bodySchema = z.object({
  type: z.enum(["start", "end"]),
  sessionId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth check ──────────────────────────────────────────────────────
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // ── Rate limit ────────────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
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

  const { type, sessionId } = parsed.data;
  const isStart = type === "start";

  // The browser used to name the recipient, the organization and the reason,
  // so a stale cookie or a crafted request could mail a DubGrid "account
  // access" notice to any address. Everything now comes from this
  // Gridmaster's own session, for the device that started it.
  const serviceClient = getServiceClient();
  const { data: session, error: sessionError } = await serviceClient
    .from("impersonation_sessions")
    .select("target_user_id, target_org_id, justification, ended_at, expires_at")
    .eq("session_id", sessionId)
    .eq("gridmaster_id", user.id)
    .eq("auth_session_id", auth.sessionId)
    .maybeSingle();
  if (sessionError) {
    logger.error({ err: sessionError }, "Failed to load impersonation session for notice");
    return NextResponse.json(
      { success: false, error: "We couldn't send that email. Try again." },
      { status: 500 },
    );
  }
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Impersonation session not found" },
      { status: 404 },
    );
  }
  const live = session.ended_at === null && new Date(session.expires_at).getTime() > Date.now();
  if (isStart !== live) {
    return NextResponse.json(
      {
        success: false,
        error: isStart
          ? "This impersonation session is no longer active."
          : "This impersonation session has not ended.",
      },
      { status: 409 },
    );
  }

  const { data: target, error: targetError } = await serviceClient.auth.admin.getUserById(
    session.target_user_id,
  );
  const targetEmail = target?.user?.email;
  if (targetError || !targetEmail) {
    return NextResponse.json(
      { success: false, error: "That account has no email address to notify." },
      { status: 404 },
    );
  }
  const { data: organization } = await serviceClient
    .from("organizations")
    .select("name")
    .eq("id", session.target_org_id)
    .maybeSingle();
  const targetOrgName = (organization?.name as string | null | undefined) || undefined;
  const justification = (session.justification as string | null) || undefined;
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
      if (ip) {
        try {
          await serviceClient
            .from("impersonation_sessions")
            .update({ ip_address: ip })
            .eq("session_id", sessionId)
            .eq("gridmaster_id", user.id)
            .eq("auth_session_id", auth.sessionId);
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
