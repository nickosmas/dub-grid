import { createElement } from "react";
import { render } from "@react-email/components";
import { createClient } from "@supabase/supabase-js";
import { emailBaseUrl } from "@/lib/email";
import { NotificationEmail } from "@/emails/NotificationEmail";
import {
  isPushEligibleNotificationType,
  sendMobilePushNotifications,
} from "@/features/mobile/server";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import type { NotificationType } from "@/types";

const NOTIFICATION_CATEGORIES: Record<string, string> = {
  // schedule
  shift_change: "schedule",
  schedule_published: "schedule",
  recurring_shift_updated: "schedule",
  shift_series_updated: "schedule",
  schedule_note_published: "schedule",
  recurring_schedules_applied: "schedule",
  // shift_requests
  shift_request_new: "shift_requests",
  shift_request_approved: "shift_requests",
  shift_request_rejected: "shift_requests",
  // membership
  invitation_received: "membership",
  invitation_accepted: "membership",
  invitation_revoked: "membership",
  invitation_resent: "membership",
  membership_removed: "membership",
  admin_permissions_changed: "membership",
  // account
  employee_created: "account",
  employee_status_changed: "account",
  employee_profile_changed: "account",
  org_settings_changed: "account",
  org_suspended: "account",
  org_unsuspended: "account",
  // billing
  billing_subscription_changed: "billing",
  billing_payment_failed: "billing",
  billing_payment_succeeded: "billing",
  // security
  security_email_changed: "security",
  security_password_changed: "security",
  security_mfa_changed: "security",
  security_new_device: "security",
  security_session_revoked: "security",
  // system
  impersonation_start: "system",
  impersonation_end: "system",
  system: "system",
};

/**
 * Default email-channel state per category when a user has no
 * notification_preferences row yet. In-app is always true by default.
 * Security and billing default to email-on because they are time-sensitive.
 */
const DEFAULT_EMAIL_ENABLED: Record<string, boolean> = {
  schedule: false,
  shift_requests: false,
  membership: false,
  account: false,
  billing: true,
  security: true,
  system: false,
};

/** Max emails per user per hour (throttle) */
const MAX_EMAILS_PER_HOUR = 10;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Create a notification and optionally send an email.
 * Should be called from server-side code (API routes, server actions).
 */
export async function sendNotification(
  userId: string,
  orgId: string | null,
  type: NotificationType,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const supabase = getServiceClient();
  const category = NOTIFICATION_CATEGORIES[type] ?? "system";

  // 1. Always create in-app notification
  const { data: insertedNotification, error: insertError } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      org_id: orgId,
      type,
      channel: "in_app",
      category,
      title,
      message,
      metadata,
    })
    .select("id")
    .maybeSingle();
  if (insertError) {
    logger.error({ error: insertError, type, userId }, "Failed to create notification");
  } else if (isPushEligibleNotificationType(type)) {
    await sendMobilePushNotifications(userId, orgId, {
      title,
      body: message,
      data: {
        notificationId: insertedNotification?.id ?? null,
        type,
        ...metadata,
      },
    });
  }

  // 2. Check user preferences for email
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();

  const userPrefs = prefs?.prefs as Record<string, { in_app?: boolean; email?: boolean }> | null;
  const emailEnabled =
    userPrefs?.[category]?.email ?? DEFAULT_EMAIL_ENABLED[category] ?? false;

  if (!emailEnabled) return;

  // 3. Throttle check — max emails per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel", "email")
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= MAX_EMAILS_PER_HOUR) {
    logger.info({ userId, type }, "Email throttled — max hourly limit reached");
    return;
  }

  // 4. Get user email
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) return;

  // 5. Send email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    logger.warn("RESEND_API_KEY not configured — skipping email notification");
    return;
  }

  try {
    const html = await render(
      createElement(NotificationEmail, {
        title,
        message,
        logoUrl: emailBaseUrl(),
      }),
    );

    await sendResendEmail({
      apiKey: resendKey,
      from: "DubGrid <notifications@dubgrid.com>",
      to: email,
      subject: title,
      html,
    });

    // Record email notification for throttle tracking. Mark it as
    // already-read and archived so it doesn't surface in the bell or
    // inbox — the throttle query (per-hour count) doesn't filter by
    // read/archive, so accounting still works.
    const nowIso = new Date().toISOString();
    await supabase.from("notifications").insert({
      user_id: userId,
      org_id: orgId,
      type,
      channel: "email",
      category,
      title,
      message,
      metadata: { ...metadata, email_sent: true },
      read_at: nowIso,
      archived_at: nowIso,
    });
  } catch (err) {
    logger.error({ error: err, userId, type }, "Failed to send email notification");
  }
}
