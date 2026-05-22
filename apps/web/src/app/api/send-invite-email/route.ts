import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { render } from "@react-email/components";
import { z } from "zod";
import { inviteLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { InviteEmail } from "@/emails/InviteEmail";
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
  const baseUrl = emailBaseUrl();
  if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_VERCEL_URL) {
    logger.warn("No NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_VERCEL_URL set — using localhost:3000 for invite links");
  }

  const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const html = await render(
    createElement(InviteEmail, {
      orgName,
      inviterName,
      acceptUrl,
      logoUrl: baseUrl,
    }),
  );

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
