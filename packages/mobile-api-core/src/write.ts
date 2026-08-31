import type { SupabaseClient } from "@supabase/supabase-js";
import type { MobileNotificationBulkBody } from "@dubgrid/contracts";

export type MobileNotificationMutationContext = {
  userClient: SupabaseClient;
};

export type MobilePushTokenContext = {
  currentOrg: {
    id: string;
  };
  user: {
    id: string;
  };
};

export async function markMobileNotificationRead(
  auth: MobileNotificationMutationContext,
  notificationId: string,
): Promise<{ success: true; unreadCount: number }> {
  const markReadResult = await auth.userClient.rpc("mark_notification_read_with_unread_count", {
    p_notification_id: notificationId,
  });

  if (markReadResult.error) {
    throw markReadResult.error;
  }

  return { success: true, unreadCount: (markReadResult.data as number | null) ?? 0 };
}

export async function markAllMobileNotificationsRead(
  auth: MobileNotificationMutationContext,
): Promise<{ success: true; unreadCount: number }> {
  const markAllResult = await auth.userClient.rpc("mark_all_notifications_read_with_unread_count");
  if (markAllResult.error) {
    throw markAllResult.error;
  }

  return { success: true, unreadCount: (markAllResult.data as number | null) ?? 0 };
}

export async function bulkMutateMobileNotifications(
  auth: MobileNotificationMutationContext,
  input: MobileNotificationBulkBody,
): Promise<{ success: true; unreadCount: number; updatedCount: number }> {
  const { ids, action } = input;

  const { data, error } = await auth.userClient.rpc("mutate_notifications_with_unread_count", {
    p_action: action,
    p_notification_ids: ids,
  });
  if (error) throw error;

  const result = (data ?? {}) as { unreadCount?: number; updatedCount?: number };
  return {
    success: true,
    unreadCount: result.unreadCount ?? 0,
    updatedCount: result.updatedCount ?? 0,
  };
}

export async function registerMobilePushToken(
  auth: MobilePushTokenContext,
  input: {
    platform: "ios" | "android";
    expoPushToken: string;
    disabled?: boolean;
  },
  deps: {
    upsertMobilePushToken: (input: {
      userId: string;
      orgId: string;
      platform: "ios" | "android";
      expoPushToken: string;
      disabled?: boolean;
    }) => Promise<void>;
  },
): Promise<{ success: true }> {
  await deps.upsertMobilePushToken({
    userId: auth.user.id,
    orgId: auth.currentOrg.id,
    platform: input.platform,
    expoPushToken: input.expoPushToken,
    disabled: input.disabled,
  });

  return { success: true };
}
