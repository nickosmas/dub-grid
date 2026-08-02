import { isFeatureEnabled } from "@/lib/feature-flags";

type ResendRecipient = string | string[];

type SendResendEmailInput = {
  apiKey: string;
  from: string;
  to: ResendRecipient;
  subject: string;
  html: string;
  replyTo?: ResendRecipient;
};

type ResendApiResponse = {
  id?: string;
};

export async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
  replyTo,
}: SendResendEmailInput): Promise<ResendApiResponse> {
  if (!(await isFeatureEnabled("resend_email"))) {
    // Matches an existing CLIENT_FRIENDLY_ERROR_PATTERNS entry
    // (packages/client-errors), so every caller that already routes errors
    // through formatClientErrorMessage gets a friendly message for free.
    throw new Error("Email service not configured: sending is disabled by a platform kill switch");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed (${response.status}): ${body}`);
  }

  return (await response.json().catch(() => ({}))) as ResendApiResponse;
}
