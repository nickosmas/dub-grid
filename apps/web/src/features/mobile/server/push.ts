import {
  deliverMobilePushNotifications,
  isPushEligibleNotificationType,
  type MobilePushPayload,
  type MobilePushPlatform,
  MobilePushDeliveryError,
} from "@dubgrid/mobile-api-core";
import {
  fetchActiveMobilePushTokenRows,
  upsertMobilePushTokenRow,
} from "@dubgrid/data-access";
import logger from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase-service";

export async function upsertMobilePushToken(input: {
  userId: string;
  orgId: string;
  platform: MobilePushPlatform;
  expoPushToken: string;
  disabled?: boolean;
}): Promise<void> {
  await upsertMobilePushTokenRow(getServiceClient(), input);
}

export async function sendMobilePushNotifications(
  userId: string,
  orgId: string | null,
  payload: MobilePushPayload,
): Promise<void> {
  const serviceClient = getServiceClient();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  try {
    await deliverMobilePushNotifications(
      {
        userId,
        orgId,
        payload,
      },
      {
        fetchPushTokens: ({ userId: targetUserId, orgId: targetOrgId }) =>
          fetchActiveMobilePushTokenRows(serviceClient, {
            userId: targetUserId,
            orgId: targetOrgId,
          }),
        sendMessages: async (messages) => {
          const response = await fetch(
            "https://exp.host/--/api/v2/push/send",
            {
              method: "POST",
              headers,
              body: JSON.stringify(messages),
            },
          );

          return {
            ok: response.ok,
            status: response.status,
          };
        },
      },
    );
  } catch (error) {
    if (error instanceof MobilePushDeliveryError) {
      logger.error(
        { status: error.status, userId, orgId },
        error.message,
      );
      return;
    }

    logger.error({ err: error, userId, orgId }, "Expo push request failed");
  }
}

export { isPushEligibleNotificationType };
