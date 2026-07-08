import { NextRequest, NextResponse } from "next/server";
import {
  getRequiredStaffEmailError,
  getStaffNameError,
  normalizeOptionalUsPhone,
} from "@dubgrid/contracts";
import { z } from "zod";
import { createElement } from "react";
import { render } from "@react-email/components";
import { demoLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { DemoRequestEmail } from "@/emails/DemoRequestEmail";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";
import {
  getLineTextError,
  getMultilineTextError,
  getOptionalUsPhoneFieldError,
  normalizeLineText,
  normalizeMultilineText,
} from "@/lib/form-validation";
import { API_ERRORS } from "@dubgrid/client-errors";

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
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Rate limit by IP ──────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const { limited, reset, misconfigured } = await checkRateLimit(demoLimiter, ip);
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

  // ── Input validation ──────────────────────────────────────────────────
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

  const { contactName, email, phone, orgName, orgSize, industry, message } = parsed.data;
  const fieldErrors = {
    contactName: getStaffNameError(contactName, "Contact name"),
    email: getRequiredStaffEmailError(email),
    phone: getOptionalUsPhoneFieldError(phone),
    orgName: getLineTextError(orgName, {
      label: "Organization name",
      maxLength: 200,
      required: true,
    }),
    industry: getLineTextError(industry, {
      label: "Industry / facility type",
      maxLength: 200,
    }),
    message: getMultilineTextError(message, {
      label: "Additional notes",
      maxLength: 2000,
    }),
  } as const;
  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return NextResponse.json(
      { success: false, error: firstFieldError, fieldErrors },
      { status: 400 },
    );
  }

  const normalizedContactName = normalizeLineText(contactName, {
    label: "Contact name",
    maxLength: 80,
    required: true,
  });
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizeOptionalUsPhone(phone);
  const normalizedOrgName = normalizeLineText(orgName, {
    label: "Organization name",
    maxLength: 200,
    required: true,
  });
  const normalizedIndustry = normalizeLineText(industry, {
    label: "Industry / facility type",
    maxLength: 200,
  });
  const normalizedMessage = normalizeMultilineText(message, {
    label: "Additional notes",
    maxLength: 2000,
  });

  // ── Build email ───────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";

  const recipientEmail = process.env.DEMO_RECIPIENT_EMAIL;

  if (!apiKey || !recipientEmail) {
    logger.error("RESEND_API_KEY or DEMO_RECIPIENT_EMAIL not set");
    return NextResponse.json(
      { success: false, error: "Email service not configured" },
      { status: 503 },
    );
  }

  const html = await render(
    createElement(DemoRequestEmail, {
      contactName: normalizedContactName,
      email: normalizedEmail,
      phone: normalizedPhone,
      orgName: normalizedOrgName,
      orgSize,
      industry: normalizedIndustry,
      notes: normalizedMessage,
      logoUrl: emailBaseUrl(),
    }),
  );

  try {
    await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: recipientEmail,
      replyTo: sanitizeHeaderValue(normalizedEmail),
      subject: sanitizeHeaderValue(`DubGrid Demo Request: ${normalizedOrgName}`),
      html,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "request-demo" } });
    logger.error({ err, path: "/api/request-demo" }, "Failed to send demo request email");
    return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
  }
}
