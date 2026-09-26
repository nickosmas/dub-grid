import "server-only";

import { createElement } from "react";
import { render } from "@react-email/components";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LoginEmailChangedEmail } from "@/emails/LoginEmailChangedEmail";
import { endUserSessions } from "@/lib/auth/revocation";
import { emailBaseUrl, sanitizeHeaderValue } from "@/lib/email";
import { getInvitationEmailConfig } from "@/features/mobile/server/invitation-email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";

export interface LoginEmailChangeFollowUp {
  serviceClient: SupabaseClient;
  userId: string;
  previousEmail: string | null;
  newEmail: string;
  orgId: string;
  actorId: string;
  actorSessionId: string | null;
}

/**
 * After an administrator changes someone's email address, sessions opened
 * under the old identity stop working and both addresses are told why.
 *
 * The change itself has already committed, and a retry of the save would find
 * no change to follow up on, so failing the request here would only hide the
 * committed change. Each step is attempted independently and a failure is
 * reported for operator follow-up instead.
 */
export async function followUpLinkedLoginEmailChange(
  input: LoginEmailChangeFollowUp,
): Promise<void> {
  try {
    // Ended at the provider too, or a refresh would restore access within the
    // hour. Changing your own staff record keeps the session doing it.
    await endUserSessions(input.userId, {
      keepSessionId: input.userId === input.actorId ? input.actorSessionId : null,
    });
  } catch (error) {
    report(error, input, "revoke-sessions");
  }

  try {
    await sendNotices(input);
  } catch (error) {
    report(error, input, "notify");
  }
}

async function sendNotices(input: LoginEmailChangeFollowUp): Promise<void> {
  const config = getInvitationEmailConfig();
  if (!config) return;

  const { data: organization } = await input.serviceClient
    .from("organizations")
    .select("name")
    .eq("id", input.orgId)
    .maybeSingle();
  const orgName = (organization?.name as string | null | undefined) || "your organization";
  const logoUrl = emailBaseUrl();
  const notices = [
    {
      to: input.newEmail,
      recipient: "new" as const,
      subject: "Your DubGrid email address was updated",
    },
    ...(input.previousEmail
      ? [
          {
            to: input.previousEmail,
            recipient: "previous" as const,
            subject: "Your DubGrid email address was changed",
          },
        ]
      : []),
  ];

  const results = await Promise.allSettled(
    notices.map(async (notice) =>
      sendResendEmail({
        apiKey: config.apiKey,
        from: config.from,
        to: notice.to,
        subject: sanitizeHeaderValue(notice.subject),
        html: await render(
          createElement(LoginEmailChangedEmail, {
            orgName,
            recipient: notice.recipient,
            newEmail: input.newEmail,
            logoUrl,
          }),
        ),
      }),
    ),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

function report(error: unknown, input: LoginEmailChangeFollowUp, step: string) {
  Sentry.captureException(error, {
    extra: { context: "login-email-change-follow-up", step, userId: input.userId },
  });
  logger.error(
    { error, step, userId: input.userId, orgId: input.orgId },
    "Login email change follow-up failed",
  );
}
