import { createClient } from "@supabase/supabase-js";
import { emailWrapper } from "@/lib/email";
import {
  isPushEligibleNotificationType,
  sendMobilePushNotifications,
} from "@/features/mobile/server";
import logger from "@/lib/logger";
import { sendResendEmail } from "@/lib/resend";
import type { NotificationType } from "@/types";

const NOTIFICATION_CATEGORIES: Record<string, string> = {
  shift_change: "schedule",
  schedule_published: "schedule",
  shift_request_new: "shift_requests",
  shift_request_approved: "shift_requests",
  shift_request_rejected: "shift_requests",
  impersonation_start: "system",
  impersonation_end: "system",
  system: "system",
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
  const emailEnabled = userPrefs?.[category]?.email ?? false; // Default off for email

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
    const html = emailWrapper(`
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #1a1a1a;">${escapeHtml(title)}</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #555; line-height: 1.6;">${escapeHtml(message)}</p>
      <p style="margin: 0; font-size: 12px; color: #999;">
        You can manage your notification preferences in your DubGrid profile settings.
      </p>
    `);

    await sendResendEmail({
      apiKey: resendKey,
      from: "DubGrid <notifications@dubgrid.com>",
      to: email,
      subject: title,
      html,
    });

    // Record email notification for throttle tracking
    await supabase.from("notifications").insert({
      user_id: userId,
      org_id: orgId,
      type,
      channel: "email",
      category,
      title,
      message,
      metadata: { ...metadata, email_sent: true },
    });
  } catch (err) {
    logger.error({ error: err, userId, type }, "Failed to send email notification");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
