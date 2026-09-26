import "server-only";

import { createElement } from "react";
import { after } from "next/server";
import { render } from "@react-email/components";
import { AccountDeletedEmail } from "@/emails/AccountDeletedEmail";
import { getInvitationEmailConfig } from "@/features/mobile/server/invitation-email";
import { emailBaseUrl } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";

export const ACCOUNT_DELETED_SUBJECT = "Your DubGrid account has been deleted";

/**
 * Tells the deleted account's address that the deletion went through. Call it
 * only after the Auth user is gone. It runs past the response and never fails
 * the deletion, which has already happened.
 */
export function scheduleAccountDeletedNotice(email: string | null | undefined): void {
  if (!email) return;
  after(async () => {
    try {
      const config = getInvitationEmailConfig();
      if (!config) return;
      await sendResendEmail({
        apiKey: config.apiKey,
        from: config.from,
        to: email,
        subject: ACCOUNT_DELETED_SUBJECT,
        html: await render(createElement(AccountDeletedEmail, { logoUrl: emailBaseUrl() })),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { context: "account-deleted-notice" } });
      logger.error({ error }, "Account deletion notice failed");
    }
  });
}
