import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inviteLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { escapeHtml, sanitizeHeaderValue, emailWrapper } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";

const bodySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  orgName: z.string().trim().min(1).max(200),
  inviterName: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  // ── Auth check ──────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;
  const { user, claims } = auth;

  // ── Rate limit by user ID ────────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(inviteLimiter, user.id);
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

  // ── Authorization check — only super_admin / gridmaster can send invites ──
  const isGridmaster = claims.platform_role === "gridmaster";
  const isSuperAdmin = claims.org_role === "super_admin";
  if (!isGridmaster && !isSuperAdmin) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 },
    );
  }

  // ── Config check ────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
  if (!process.env.RESEND_FROM_EMAIL) {
    logger.warn("RESEND_FROM_EMAIL not set — using test domain (onboarding@resend.dev)");
  }

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Email service not configured" },
      { status: 500 },
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

  const { token, email, orgName, inviterName } = parsed.data;

  // ── Build email ─────────────────────────────────────────────────────
  const emailBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null) ||
    "http://localhost:3000";
  if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_VERCEL_URL) {
    logger.warn("No NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_VERCEL_URL set — using localhost:3000 for invite links");
  }

  const acceptUrl = `${emailBaseUrl}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const inviterLine = inviterName
    ? `<p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">
        <strong>${escapeHtml(inviterName)}</strong> has invited you to join
        <strong>${escapeHtml(orgName)}</strong> on DubGrid.
      </p>`
    : `<p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">
        You've been invited to join <strong>${escapeHtml(orgName)}</strong> on DubGrid.
      </p>`;

  const html = emailWrapper(`
      <h2 style="color:#111410;font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:-0.02em;">
        You're Invited
      </h2>
      ${inviterLine}
      <p style="color:#3E433B;font-size:15px;line-height:1.6;margin:0 0 32px;">
        Click the button below to set your password and accept your invitation.
      </p>
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${acceptUrl}"
           style="display:inline-block;padding:14px 40px;background:#2563EB;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;box-shadow:0 4px 12px rgba(37,99,235,0.2);">
          Accept Invitation
        </a>
      </div>
      <p style="color:#94A3B8;font-size:13px;line-height:1.6;margin:0 0 8px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color:#5A5F57;font-size:13px;line-height:1.6;margin:0 0 24px;word-break:break-all;">
        ${acceptUrl}
      </p>
      <div style="border-top:1px solid #D0DBD4;padding-top:20px;">
        <p style="color:#94A3B8;font-size:13px;margin:0;">
          This invitation expires in 72 hours. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>`);

  try {
    await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: email,
      subject: sanitizeHeaderValue(`You're invited to join ${orgName} on DubGrid`),
      html,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "send-invite-email" } });
    logger.error({ err, path: "/api/send-invite-email" }, "Failed to send invite email");
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 },
    );
  }
}
