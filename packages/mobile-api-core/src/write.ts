import type { SupabaseClient } from "@supabase/supabase-js";
import type { MobileNotificationBulkBody } from "@dubgrid/contracts";

export class MobileApiRefreshError extends Error {
  constructor(message = "Unable to refresh unread notification count") {
    super(message);
    this.name = "MobileApiRefreshError";
  }
}

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

async function readUnreadNotificationCount(userClient: SupabaseClient): Promise<number> {
  const unreadCountResult = await userClient.rpc("get_unread_notification_count");
  if (unreadCountResult.error) {
    throw unreadCountResult.error;
  }

  return (unreadCountResult.data as number | null) ?? 0;
}

export async function markMobileNotificationRead(
  auth: MobileNotificationMutationContext,
  notificationId: string,
): Promise<{ success: true; unreadCount: number }> {
  const markReadResult = await auth.userClient.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (markReadResult.error) {
    throw markReadResult.error;
  }

  try {
    const unreadCount = await readUnreadNotificationCount(auth.userClient);

    return {
      success: true,
      unreadCount,
    };
  } catch (error) {
    throw new MobileApiRefreshError(error instanceof Error ? error.message : undefined);
  }
}

export async function markAllMobileNotificationsRead(
  auth: MobileNotificationMutationContext,
): Promise<{ success: true; unreadCount: number }> {
  const markAllResult = await auth.userClient.rpc("mark_all_notifications_read");
  if (markAllResult.error) {
    throw markAllResult.error;
  }

  try {
    const unreadCount = await readUnreadNotificationCount(auth.userClient);

    return {
      success: true,
      unreadCount,
    };
  } catch (error) {
    throw new MobileApiRefreshError(error instanceof Error ? error.message : undefined);
  }
}

export async function bulkMutateMobileNotifications(
  auth: MobileNotificationMutationContext,
  input: MobileNotificationBulkBody,
): Promise<{ success: true; unreadCount: number; updatedCount: number }> {
  const { ids, action } = input;

  const patch =
    action === "read"
      ? { read_at: new Date().toISOString() }
      : action === "unread"
        ? { read_at: null }
        : action === "archive"
          ? { archived_at: new Date().toISOString() }
          : { archived_at: null };

  const { error: mutationError, count } = await auth.userClient
    .from("notifications")
    .update(patch, { count: "exact" })
    .in("id", ids);

  if (mutationError) {
    throw mutationError;
  }

  const updatedCount = count ?? 0;

  try {
    const unreadCount = await readUnreadNotificationCount(auth.userClient);

    return {
      success: true,
      unreadCount,
      updatedCount,
    };
  } catch (error) {
    throw new MobileApiRefreshError(error instanceof Error ? error.message : undefined);
  }
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
