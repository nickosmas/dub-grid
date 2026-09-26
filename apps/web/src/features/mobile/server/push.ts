import {
  deliverMobilePushNotifications,
  isAccountWidePushType,
  isPushEligibleNotificationType,
  type MobilePushPayload,
  type MobilePushPlatform,
  MobilePushDeliveryError,
} from "@dubgrid/mobile-api-core";
import { fetchActiveMobilePushTokenRows, upsertMobilePushTokenRow } from "@dubgrid/data-access";
import logger from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase-service";
import { serverEnv } from "@/lib/env.server";

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
  options: { accountWide?: boolean } = {},
): Promise<void> {
  const serviceClient = getServiceClient();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (serverEnv?.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${serverEnv?.EXPO_ACCESS_TOKEN}`;
  }

  try {
    await deliverMobilePushNotifications(
      {
        userId,
        orgId,
        payload,
        accountWide: options.accountWide,
      },
      {
        fetchPushTokens: ({ userId: targetUserId, orgId: targetOrgId }) =>
          fetchActiveMobilePushTokenRows(serviceClient, {
            userId: targetUserId,
            orgId: targetOrgId,
          }),
        sendMessages: async (messages) => {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers,
            body: JSON.stringify(messages),
          });

          return {
            ok: response.ok,
            status: response.status,
          };
        },
      },
    );
  } catch (error) {
    if (error instanceof MobilePushDeliveryError) {
      logger.error({ status: error.status, userId, orgId }, error.message);
      return;
    }

    logger.error({ err: error, userId, orgId }, "Expo push request failed");
  }
}

export { isAccountWidePushType, isPushEligibleNotificationType };
