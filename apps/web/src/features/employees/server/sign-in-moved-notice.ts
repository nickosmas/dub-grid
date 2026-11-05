import "server-only";

import { createElement } from "react";
import { after } from "next/server";
import { render } from "@react-email/components";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SignInMovedEmail } from "@/emails/SignInMovedEmail";
import { getInvitationEmailConfig } from "@/features/mobile/server/invitation-email";
import { emailBaseUrl, sanitizeHeaderValue } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";

/**
 * Tells the old address that a staff record left it. It never prints the new
 * address, and it runs past the response because the move has already happened.
 */
export function scheduleSignInMovedNotice(
  serviceClient: SupabaseClient,
  input: { email: string | null | undefined; orgId: string },
): void {
  const { email, orgId } = input;
  if (!email) return;
  after(async () => {
    try {
      const config = getInvitationEmailConfig();
      if (!config) return;
      const { data: organization } = await serviceClient
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();
      const orgName = (organization?.name as string | null) || "your organization";
      await sendResendEmail({
        apiKey: config.apiKey,
        from: config.from,
        to: email,
        subject: sanitizeHeaderValue(`Your access to ${orgName} changed`),
        html: await render(createElement(SignInMovedEmail, { orgName, logoUrl: emailBaseUrl() })),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { context: "sign-in-moved-notice" } });
      logger.error({ error }, "Sign-in moved notice failed");
    }
  });
}
