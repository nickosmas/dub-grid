import { getServiceClient } from "@/lib/supabase-service";
import {
  getInvitationEmailConfig,
  sendInvitationEmail,
} from "@/features/mobile/server/invitation-email";

export const EMAIL_NOT_CONFIGURED = "Email service not configured";

/** Emails a pending invitation's link, naming the organization from its row. */
export async function sendPendingInvitationEmail(input: {
  orgId: string;
  token: string;
  email: string;
}) {
  const config = getInvitationEmailConfig();
  if (!config) {
    throw new Error(EMAIL_NOT_CONFIGURED);
  }

  const { data: organization, error } = await getServiceClient()
    .from("organizations")
    .select("name")
    .eq("id", input.orgId)
    .maybeSingle();
  if (error) throw error;

  await sendInvitationEmail({
    config,
    token: input.token,
    email: input.email,
    orgName: (organization?.name as string | null) || "your organization",
  });
}

/** True for both a missing key and the platform's sending kill switch. */
export function isEmailNotConfigured(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(EMAIL_NOT_CONFIGURED);
}
