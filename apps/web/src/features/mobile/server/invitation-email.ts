import { NextResponse } from "next/server";
import { createElement } from "react";
import { render } from "@react-email/components";
import { InviteEmail, type InvitationEmailKind } from "@/emails/InviteEmail";
import { sanitizeHeaderValue, emailBaseUrl } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import { serverEnv } from "@/lib/env.server";

/**
 * The one invitation email path the mobile API uses. Both the staff-invitation
 * route and the management-access routes send the same email through the same
 * Resend config, so this lives beside them rather than being copied into each
 * — the two had no reason to be able to drift.
 */
export type InvitationEmailConfig = {
  apiKey: string;
  from: string;
};

export function getInvitationEmailConfig(): InvitationEmailConfig | null {
  const apiKey = serverEnv?.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  const from = serverEnv?.RESEND_FROM_EMAIL || "DubGrid <onboarding@resend.dev>";
  if (!serverEnv?.RESEND_FROM_EMAIL) {
    logger.warn("RESEND_FROM_EMAIL not set - using test domain for mobile invite");
  }

  return { apiKey, from };
}

export function createInvitationEmailUnavailableResponse() {
  return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
}

export async function sendInvitationEmail(input: {
  config: InvitationEmailConfig;
  token: string | null | undefined;
  email: string;
  orgName: string;
  /** The expiry just stored on the row, so the email states the real deadline. */
  expiresAt: string | null;
  timeZone: string | null;
  kind: InvitationEmailKind;
}) {
  if (!input.token) {
    throw new Error("We couldn't create that invitation link. Try again.");
  }

  const baseUrl = emailBaseUrl();
  const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(input.token)}&email=${encodeURIComponent(input.email)}`;

  const html = await render(
    createElement(InviteEmail, {
      orgName: input.orgName,
      acceptUrl,
      logoUrl: baseUrl,
      expiresAt: input.expiresAt,
      timeZone: input.timeZone,
      kind: input.kind,
    }),
  );

  await sendResendEmail({
    apiKey: input.config.apiKey,
    from: input.config.from,
    to: input.email,
    subject: sanitizeHeaderValue(invitationSubject(input.orgName, input.kind)),
    html,
  });
}

function invitationSubject(orgName: string, kind: InvitationEmailKind): string {
  return kind === "reissue"
    ? `Your new invitation to join ${orgName} on DubGrid`
    : `You're invited to join ${orgName} on DubGrid`;
}
