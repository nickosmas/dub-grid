import "server-only";

import { after } from "next/server";
import { dispatchNotificationEvent, type NotificationEvent } from "@/features/notifications/server";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

const RECENT_SIGN_IN_SECONDS = 15 * 60;

/**
 * Whether the token's session began with a sign-in in the last 15 minutes.
 * `amr` records when each method was used and survives refreshes, so an old
 * session whose row was recreated (after a role change deletes the rows, for
 * instance) does not read as a new sign-in.
 */
export function signedInRecently(claims: unknown): boolean {
  const amr = (claims as { amr?: unknown } | null)?.amr;
  if (!Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return amr.some((entry) => {
    const timestamp = (entry as { timestamp?: unknown } | null)?.timestamp;
    return (
      typeof timestamp === "number" &&
      timestamp <= now + 60 &&
      now - timestamp <= RECENT_SIGN_IN_SECONDS
    );
  });
}

/**
 * Claims the first report of a new sign-in, exactly once per session.
 *
 * The access-token hook creates the session's `user_sessions` row when its
 * first token is minted, before the app ever reports it, so "no row yet" is
 * never true (the flaw in the first F-19 repair). The hook leaves `platform`
 * empty and only the app fills it, so the report that fills it is the first,
 * and the conditional update lets only one concurrent report win.
 */
export async function claimNewSignIn(input: {
  userId: string;
  supabaseSessionId: string;
  platform: "web" | "ios" | "android";
  claims: unknown;
}): Promise<boolean> {
  if (!signedInRecently(input.claims)) return false;
  try {
    const service = getServiceClient();
    const { data: claimed, error } = await service
      .from("user_sessions")
      .update({ platform: input.platform })
      .eq("user_id", input.userId)
      .eq("supabase_session_id", input.supabaseSessionId)
      .is("platform", null)
      .select("id");
    if (error) throw error;
    if ((claimed ?? []).length > 0) return true;

    // No hook-created row to claim: new only if there is no row at all.
    const { data: existing, error: existingError } = await service
      .from("user_sessions")
      .select("id")
      .eq("supabase_session_id", input.supabaseSessionId)
      .limit(1);
    if (existingError) throw existingError;
    return (existing ?? []).length === 0;
  } catch (err) {
    // Never block sign-in over detection. A missed alert is logged instead.
    logger.warn({ err, userId: input.userId }, "new sign-in detection failed");
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
