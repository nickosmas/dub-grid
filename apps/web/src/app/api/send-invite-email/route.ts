import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { render } from "@react-email/components";
import { z } from "zod";
import { inviteLimiter, emailTargetLimiter, checkRateLimit, hashEmail } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import { InviteEmail } from "@/emails/InviteEmail";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

const bodySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  orgName: z.string().trim().min(1).max(200),
  inviterName: z.string().trim().max(200).optional(),
});

async function lookupPendingInvitation(
  token: string,
): Promise<{ orgId: string; email: string; orgName: string } | null> {
  const { data } = await getServiceClient()
    .from("invitations")
    .select("org_id, email, organizations!inner(name, archived_at)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .is("accepted_at", null)
    .is("revoked_at", null)
    .is("organizations.archived_at", null)
    .maybeSingle();
  const orgName = (data?.organizations as { name?: string | null } | null)?.name;
  if (!data || !orgName) return null;
  return { orgId: data.org_id as string, email: data.email as string, orgName };
}

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

  // ── Authorization check ─────────────────────────────────────────────
  // Whoever may create an invitation may send it: an admin holding
  // canManageEmployees could previously create one it could not deliver. The
  // claim decides only whether to spend a lookup; the invitation's own
  // organization is what the capability is resolved against, below.
  const isGridmaster = claims.platform_role === "gridmaster";
  const claimedRole = claims.org_role;
  if (!isGridmaster && claimedRole !== "super_admin" && claimedRole !== "admin") {
    return NextResponse.json(
      { success: false, error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES },
      { status: 403 },
    );
  }

  // ── Config check ────────────────────────────────────────────────────
  const apiKey = serverEnv?.RESEND_API_KEY;
  const fromEmail = serverEnv?.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
  if (!serverEnv?.RESEND_FROM_EMAIL) {
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
    return NextResponse.json({ success: false, error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const { token, email, inviterName } = parsed.data;

  // ── The token must be a live invitation for this address, in an
  // organization the caller may act for. Body copy is not trusted: the
  // organization name comes from the row, so this route cannot be used to
  // mail arbitrary addresses a branded invitation with any link (F-93).
  const invitation = await lookupPendingInvitation(token);
  const callerMayActForOrg =
    isGridmaster || (typeof claims.org_id === "string" && claims.org_id === invitation?.orgId);
  if (
    !invitation ||
    invitation.email.toLowerCase() !== email.toLowerCase() ||
    !callerMayActForOrg
  ) {
    return NextResponse.json(
      { success: false, error: "We couldn't send that email. Try again." },
      { status: 404 },
    );
  }
  const orgName = invitation.orgName;

  // Resolved against the invitation's organization, not the caller's claim, and
  // authoritative: it reads the admin_permissions blob a claim cannot carry, and
  // refuses a billing-locked organization or an inactive caller.
  if (!(await canManageEmployees(getServiceClient(), user.id, invitation.orgId))) {
    return NextResponse.json(
      { success: false, error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES },
      { status: 403 },
    );
  }

  // ── Per-target-email rate limit ───────────────────────────────────────
  // The per-actor limit above doesn't stop one sender from flooding a single
  // inbox; cap invites to any one recipient at 5/hour.
  const target = await checkRateLimit(emailTargetLimiter, `invite-email:${hashEmail(email)}`);
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
          "We've sent several invites to that address already. Wait a few minutes and try again.",
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // ── Build email ─────────────────────────────────────────────────────
  // Throws in production when no public origin is configured, so a bad
  // deploy fails here instead of mailing localhost links.
  const baseUrl = emailBaseUrl();
  if (!clientEnv?.NEXT_PUBLIC_SITE_URL && !clientEnv?.NEXT_PUBLIC_VERCEL_URL) {
    logger.warn(
      "No NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_VERCEL_URL set - using localhost:3000 for invite links",
    );
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
      { success: false, error: "We couldn't send that email. Try again." },
      { status: 500 },
    );
  }
}
