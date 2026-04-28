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
