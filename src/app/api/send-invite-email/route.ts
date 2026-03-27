import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { jwtVerify, decodeJwt } from "jose";
import { Resend } from "resend";
import { z } from "zod";
import { inviteLimiter, checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml, sanitizeHeaderValue, emailWrapper } from "@/lib/email";

const bodySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  orgName: z.string().trim().min(1).max(200),
  inviterName: z.string().trim().max(200).optional(),
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
  const { limited, reset, misconfigured } = await checkRateLimit(inviteLimiter, session.user.id);
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

  // ── CSRF: validate Origin header ────────────────────────────────────────
  const origin = req.headers.get("origin");
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null);
  if (!origin || !siteUrl) {
    // Fail-closed in production when Origin or site URL is absent
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
    // Allow exact match or subdomains (acme.dubgrid.com → dubgrid.com)
    const originHost = new URL(origin).host;
    if (originHost !== allowedHost && !originHost.endsWith(`.${allowedHost}`)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
  }

  // ── Authorization check — only super_admin / gridmaster can send invites ──
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  type JwtClaims = { platform_role?: unknown; org_role?: unknown };
  let claims: JwtClaims | null = null;

  // Try verified JWT first
  if (jwtSecret) {
    try {
      const { payload } = await jwtVerify(
        session.access_token,
        new TextEncoder().encode(jwtSecret),
      );
      claims = payload as JwtClaims;
    } catch {
      // jwtVerify can fail in dev (secret mismatch) — fall through to unverified decode
    }
  }

  // Fallback to unverified decode (dev only; production requires verified JWT)
  if (!claims) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: jwtSecret ? "Invalid session" : "Server misconfigured" },
        { status: jwtSecret ? 401 : 500 },
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

  const isGridmaster = claims!.platform_role === "gridmaster";
  const isSuperAdmin = claims!.org_role === "super_admin";
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
    console.warn("[send-invite-email] RESEND_FROM_EMAIL not set — using test domain (onboarding@resend.dev)");
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
    console.warn("[send-invite-email] No NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_VERCEL_URL set — using localhost:3000 for invite links");
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
           style="display:inline-block;padding:14px 40px;background:#005F02;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;box-shadow:0 4px 12px rgba(0,95,2,0.2);">
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
    console.error("[send-invite-email] Resend error:", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 },
    );
  }
}
