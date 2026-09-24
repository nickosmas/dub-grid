import "server-only";

import { after } from "next/server";
import { dispatchNotificationEvent, type NotificationEvent } from "@/features/notifications/server";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

/**
 * Whether this authenticated Supabase session is being reported for the first
 * time. Keyed on the session rather than the device label, which collapses
 * every Mac to "Macintosh" and every Windows machine to "Windows PC", so a
 * second computer never alerted. Refreshes of one session stay quiet.
 */
export async function isNewSignInSession(
  userId: string,
  supabaseSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await getServiceClient()
      .from("user_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("supabase_session_id", supabaseSessionId)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length === 0;
  } catch (err) {
    // Never block sign-in over detection. A missed alert is logged instead.
    logger.warn({ err, userId }, "new sign-in detection failed");
    return false;
  }
}

/**
 * Sends a security alert after the response, for the lifetime of the request.
 * A bare `void` promise could be cut off when the serverless function
 * finished, which silently dropped the alert.
 */
export function scheduleSecurityAlert(actorUserId: string, event: NotificationEvent): void {
  after(async () => {
    await dispatchNotificationEvent(actorUserId, event);
  });
}
