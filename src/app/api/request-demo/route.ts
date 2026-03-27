import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { demoLimiter, checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml, sanitizeHeaderValue, emailWrapper } from "@/lib/email";

const bodySchema = z.object({
  contactName: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  phone: z.string().trim().max(30).optional().default(""),
  orgName: z.string().trim().min(1, "Organization name is required").max(200),
  orgSize: z.string().trim().min(1, "Employee count is required").max(50),
  industry: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
});

export async function POST(req: NextRequest) {
  // ── Rate limit by IP ──────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const { limited, reset, misconfigured } = await checkRateLimit(
    demoLimiter,
    ip,
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
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── CSRF: validate Origin header ──────────────────────────────────────
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
    if (
      originHost !== allowedHost &&
      !originHost.endsWith(`.${allowedHost}`)
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
  }

  // ── Input validation ──────────────────────────────────────────────────
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

  const { contactName, email, phone, orgName, orgSize, industry, message } =
    parsed.data;

  // ── Build email ───────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("[request-demo] RESEND_API_KEY not set");
    return NextResponse.json(
      { success: false, error: "Email service not configured" },
      { status: 503 },
    );
  }

  const fieldRow = (label: string, value: string) =>
    value
      ? `<tr>
          <td style="padding:8px 12px;font-size:14px;color:#94A3B8;white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:8px 12px;font-size:15px;color:#3E433B;">${escapeHtml(value)}</td>
        </tr>`
      : "";

  const html = emailWrapper(`
      <h2 style="color:#111410;font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:-0.02em;">
        New Demo Request
      </h2>
      <p style="color:#3E433B;font-size:16px;line-height:1.6;margin:0 0 24px;">
        <strong>${escapeHtml(contactName)}</strong> from <strong>${escapeHtml(orgName)}</strong> has requested a demo.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #D0DBD4;border-radius:8px;">
        ${fieldRow("Name", contactName)}
        ${fieldRow("Email", email)}
        ${fieldRow("Phone", phone)}
        ${fieldRow("Organization", orgName)}
        ${fieldRow("Employees", orgSize)}
        ${fieldRow("Industry", industry)}
      </table>
      ${
        message
          ? `<div style="margin-top:24px;">
              <p style="color:#94A3B8;font-size:13px;margin:0 0 8px;font-weight:600;">Additional Notes</p>
              <p style="color:#3E433B;font-size:15px;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
            </div>`
          : ""
      }
      <div style="border-top:1px solid #D0DBD4;padding-top:20px;margin-top:24px;">
        <p style="color:#94A3B8;font-size:13px;margin:0;">
          Reply directly to this email to respond to ${escapeHtml(contactName)}.
        </p>
      </div>`);

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to: process.env.DEMO_RECIPIENT_EMAIL || "nicokosmas.dev@gmail.com",
      replyTo: sanitizeHeaderValue(email),
      subject: sanitizeHeaderValue(`DubGrid Demo Request: ${orgName}`),
      html,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      "[request-demo] Resend error:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 },
    );
  }
}
