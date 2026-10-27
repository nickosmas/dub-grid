import "server-only";

import { createElement } from "react";
import { after } from "next/server";
import { render } from "@react-email/components";
import { AccessSuspendedEmail, accessSuspendedSubject } from "@/emails/AccessSuspendedEmail";
import { getInvitationEmailConfig } from "@/features/mobile/server/invitation-email";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { emailBaseUrl } from "@/lib/email";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import * as Sentry from "@/lib/sentry";
import { getServiceClient } from "@/lib/supabase-service";

export interface SuspensionNoticeInput {
  orgId: string;
  empId: string;
  actorId: string;
}

async function emailSuspendedPerson(orgId: string, empId: string): Promise<void> {
  const config = getInvitationEmailConfig();
  if (!config) return;
  const db = getServiceClient();
  const [{ data: employee }, { data: org }] = await Promise.all([
    db.from("employees").select("user_id").eq("id", empId).eq("org_id", orgId).maybeSingle(),
    db.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  // Without an account there's nobody to email.
  const userId = (employee?.user_id as string | null | undefined) ?? null;
  if (!userId) return;
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  const organizationName = (org?.name as string | undefined) ?? null;
  if (!email || !organizationName) return;
  await sendResendEmail({
    apiKey: config.apiKey,
    from: config.from,
    to: email,
    subject: accessSuspendedSubject(organizationName),
    html: await render(
      createElement(AccessSuspendedEmail, { logoUrl: emailBaseUrl(), organizationName }),
    ),
  });
}

/**
 * After a suspension (51d): emails the person, who can't sign in to read an
 * alert, and alerts the organization's other Super Admins. Runs past the
 * response and never fails the suspension, which has already happened.
 */
export function scheduleSuspensionNotice({ orgId, empId, actorId }: SuspensionNoticeInput): void {
  after(async () => {
    const tasks: Array<[string, () => Promise<unknown>]> = [
      [
        "alert",
        () => dispatchNotificationEvent(actorId, { action: "employee_suspended", orgId, empId }),
      ],
      ["email", () => emailSuspendedPerson(orgId, empId)],
    ];
    await Promise.all(
      tasks.map(async ([kind, task]) => {
        try {
          await task();
        } catch (error) {
          Sentry.captureException(error, { extra: { context: "suspension-notice", kind } });
          logger.error({ error, orgId, empId, kind }, "Suspension notice failed");
        }
      }),
    );
  });
}
