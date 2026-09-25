import "server-only";

import { createElement } from "react";
import { after } from "next/server";
import { render } from "@react-email/components";
import {
  ImpersonationNoticeEmail,
  impersonationNoticeSubject,
} from "@/emails/ImpersonationNoticeEmail";
import { getInvitationEmailConfig } from "@/features/mobile/server/invitation-email";
import { emailBaseUrl, sanitizeHeaderValue } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";
import { getServiceClient } from "@/lib/supabase-service";

export type ImpersonationNotice = {
  kind: "start" | "end";
  targetUserId: string;
  targetOrgId: string | null;
  /** When a started session ends at the latest. */
  expiresAt?: string | null;
};

/**
 * Tells the person whose account a Gridmaster used, from the server, at the
 * moment the session starts or actually ends. Each of those happens once, so
 * each notice goes once, and a closed tab or an aborted request no longer
 * loses it. Runs past the response and never fails the action.
 */
export function scheduleImpersonationNotice(notice: ImpersonationNotice): void {
  after(async () => {
    try {
      await sendImpersonationNotice(notice);
    } catch (error) {
      Sentry.captureException(error, { extra: { context: "impersonation-notice" } });
      logger.error({ error, kind: notice.kind }, "Impersonation notice failed");
    }
  });
}

async function sendImpersonationNotice(notice: ImpersonationNotice): Promise<void> {
  const config = getInvitationEmailConfig();
  if (!config) {
    logger.warn({ kind: notice.kind }, "Impersonation notice not sent: no email provider");
    return;
  }

  const service = getServiceClient();
  const { data: target, error } = await service.auth.admin.getUserById(notice.targetUserId);
  if (error) throw error;
  const to = target?.user?.email;
  if (!to) return;

  const { data: organization } = notice.targetOrgId
    ? await service
        .from("organizations")
        .select("name, timezone")
        .eq("id", notice.targetOrgId)
        .maybeSingle()
    : { data: null };
  const orgName = (organization?.name as string | null | undefined) || undefined;
  const timeZone = (organization?.timezone as string | null | undefined) ?? null;
  const ended = notice.kind === "end";

  await sendResendEmail({
    apiKey: config.apiKey,
    from: config.from,
    to,
    subject: sanitizeHeaderValue(impersonationNoticeSubject(ended, orgName)),
    html: await render(
      createElement(ImpersonationNoticeEmail, {
        orgName,
        ended,
        expiresAt: ended ? null : notice.expiresAt,
        timeZone,
        logoUrl: emailBaseUrl(),
      }),
    ),
  });
}
