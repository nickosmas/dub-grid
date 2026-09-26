import "server-only";

import { createElement } from "react";
import { after } from "next/server";
import { render } from "@react-email/components";
import { TWO_FACTOR_RESET_SUBJECT, TwoFactorResetEmail } from "@/emails/TwoFactorResetEmail";
import { getInvitationEmailConfig } from "@/features/mobile/server/invitation-email";
import { emailBaseUrl, sanitizeHeaderValue } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";

/**
 * Emails the person whose two-factor a Gridmaster reset. Runs past the
 * response and never fails the reset, which has already committed.
 */
export function scheduleTwoFactorResetNotice(to: string): void {
  after(async () => {
    try {
      const config = getInvitationEmailConfig();
      if (!config) {
        logger.warn("Two-factor reset notice not sent: no email provider");
        return;
      }
      await sendResendEmail({
        apiKey: config.apiKey,
        from: config.from,
        to,
        subject: sanitizeHeaderValue(TWO_FACTOR_RESET_SUBJECT),
        html: await render(createElement(TwoFactorResetEmail, { logoUrl: emailBaseUrl() })),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { context: "two-factor-reset-notice" } });
      logger.error({ error }, "Two-factor reset notice failed");
    }
  });
}
