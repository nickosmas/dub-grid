import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { decodeJwt } from "jose";
import { Resend } from "resend";
import { z } from "zod";

const bodySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  orgName: z.string().min(1).max(200),
  inviterName: z.string().max(200).optional(),
});

/** Strip CRLF / newline chars to prevent email header injection. */
function sanitizeHeaderValue(str: string): string {
  return str.replace(/[\r\n]/g, "");
}

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

  // ── Authorization check — only super_admin / gridmaster can send invites ──
  try {
    const claims = decodeJwt(session.access_token);
    const isGridmaster = claims.platform_role === "gridmaster";
    const isSuperAdmin = claims.org_role === "super_admin";
    if (!isGridmaster && !isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid session" },
      { status: 401 },
    );
  }

  // ── Config check ────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";

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
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null) ||
    "http://localhost:3000";

  const acceptUrl = `${siteUrl}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const inviterLine = inviterName
    ? `<p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">
        <strong>${escapeHtml(inviterName)}</strong> has invited you to join
        <strong>${escapeHtml(orgName)}</strong> on DubGrid.
      </p>`
    : `<p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">
        You've been invited to join <strong>${escapeHtml(orgName)}</strong> on DubGrid.
      </p>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    <!-- Header -->
    <div style="background:#0357CA;border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0;letter-spacing:-0.02em;">DubGrid</h1>
    </div>
    <!-- Body -->
    <div style="background:#fff;padding:40px 32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
      <h2 style="color:#111410;font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:-0.02em;">
        You're Invited
      </h2>
      ${inviterLine}
      <p style="color:#3E433B;font-size:15px;line-height:1.6;margin:0 0 32px;">
        Click the button below to set your password and accept your invitation.
      </p>
      <!-- CTA -->
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${acceptUrl}"
           style="display:inline-block;padding:14px 40px;background:#0357CA;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;box-shadow:0 4px 12px rgba(3,87,202,0.2);">
          Accept Invitation
        </a>
      </div>
      <!-- Fallback link -->
      <p style="color:#94A3B8;font-size:13px;line-height:1.6;margin:0 0 8px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color:#5A5F57;font-size:13px;line-height:1.6;margin:0 0 24px;word-break:break-all;">
        ${acceptUrl}
      </p>
      <!-- Expiry notice -->
      <div style="border-top:1px solid #D0DBD4;padding-top:20px;">
        <p style="color:#94A3B8;font-size:13px;margin:0;">
          This invitation expires in 72 hours. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: sanitizeHeaderValue(
        `You're invited to join ${orgName} on DubGrid`,
      ),
      html,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-invite-email] Resend error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 },
    );
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
