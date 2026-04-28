import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { escapeHtml, sanitizeHeaderValue, emailWrapper } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";

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

  // ── Authorization — only gridmaster can trigger impersonation notifications ──
  if (claims.platform_role !== "gridmaster") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 },
    );
  }

  // ── Config check ──────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
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

  const { targetEmail, targetOrgName, type, justification } = parsed.data;
  const orgDisplay = targetOrgName ? escapeHtml(targetOrgName) : "your organization";

  const isStart = type === "start";
  const subject = isStart
    ? `Account access notice — ${targetOrgName || "DubGrid"}`
    : `Account access ended — ${targetOrgName || "DubGrid"}`;

  const headline = isStart ? "Account Access Notice" : "Account Access Ended";
  const justificationHtml = isStart && justification
    ? `<br><br><strong>Reason:</strong> ${escapeHtml(justification)}`
    : "";
  const bodyText = isStart
    ? `A platform administrator is currently reviewing your account on <strong>${orgDisplay}</strong> for support purposes. This is a routine support action.${justificationHtml}`
    : `A platform administrator has finished reviewing your account on <strong>${orgDisplay}</strong>. No further action is required.`;

  const html = emailWrapper(`
      <h2 style="color:#111410;font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:-0.02em;">
        ${headline}
      </h2>
      <p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">
        ${bodyText}
      </p>
      <div style="border-top:1px solid #D0DBD4;padding-top:20px;">
        <p style="color:#94A3B8;font-size:13px;margin:0;">
          This is an automated notification from DubGrid. If you have questions about this access, please contact your organization administrator.
        </p>
      </div>`);

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
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (ip && serviceRoleKey) {
        try {
          const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
          );
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
    logger.error({ err, path: "/api/notify-impersonation" }, "Failed to send impersonation notification email");
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 },
    );
  }
}
