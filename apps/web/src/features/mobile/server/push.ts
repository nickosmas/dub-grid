import logger from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase-service";

type MobilePlatform = "ios" | "android";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const PUSH_ELIGIBLE_TYPES = new Set([
  "schedule_published",
  "shift_request_new",
  "shift_request_approved",
  "shift_request_rejected",
]);

export function isPushEligibleNotificationType(type: string): boolean {
  return PUSH_ELIGIBLE_TYPES.has(type);
}

export async function upsertMobilePushToken(input: {
  userId: string;
  orgId: string;
  platform: MobilePlatform;
  expoPushToken: string;
  disabled?: boolean;
}): Promise<void> {
  const serviceClient = getServiceClient();
  const now = new Date().toISOString();

  const { error } = await serviceClient
    .from("mobile_device_tokens")
    .upsert(
      {
        user_id: input.userId,
        org_id: input.orgId,
        platform: input.platform,
        expo_push_token: input.expoPushToken,
        last_seen_at: now,
        disabled_at: input.disabled ? now : null,
      },
      {
        onConflict: "expo_push_token",
      },
    );

  if (error) {
    throw error;
  }
}

export async function sendMobilePushNotifications(
  userId: string,
  orgId: string | null,
  payload: PushPayload,
): Promise<void> {
  if (!orgId) return;

  const serviceClient = getServiceClient();
  const { data: tokens, error } = await serviceClient
    .from("mobile_device_tokens")
    .select("expo_push_token")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("disabled_at", null);

  if (error || !tokens?.length) {
    return;
  }

  const messages = tokens.map((row) => ({
    to: row.expo_push_token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, userId, orgId },
        "Expo push delivery failed",
      );
    }
  } catch (err) {
    logger.error({ err, userId, orgId }, "Expo push request failed");
  }
}
