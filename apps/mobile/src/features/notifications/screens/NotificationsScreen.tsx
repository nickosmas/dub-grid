import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../shared/components/Button";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ListSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { queryClient } from "../../../shared/lib/query-client";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileColors,
  mobileRadii,
  mobileText,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";

type NotificationDestination =
  | "/(tabs)/me"
  | "/(tabs)/requests"
  | "/(tabs)/profile";

type MobileNotificationRecord = {
  id: string;
  type: string;
  channel: "in_app" | "email";
  category: string | null;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type MobileNotificationsFeed = {
  unreadCount: number;
  notifications: MobileNotificationRecord[];
};

type NotificationNavigationTarget =
  | NotificationDestination
  | {
      pathname: "/(tabs)/requests";
      params: {
        requestId: string;
        tab: "approval" | "mine";
      };
    };

function formatRelativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.floor(diff / 60000), 0);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getRequestIdFromMetadata(metadata: Record<string, unknown>): string | null {
  const requestId = metadata.requestId;

  return typeof requestId === "string" && requestId.length > 0
    ? requestId
    : null;
}

function getNotificationDestination(input: {
  metadata: Record<string, unknown>;
  type: string;
}): NotificationNavigationTarget {
  const requestId = getRequestIdFromMetadata(input.metadata);
  const requestTab =
    input.metadata.tab === "mine" || input.metadata.tab === "approval"
      ? input.metadata.tab
      : null;

  if (input.type === "shift_request_new" && requestId) {
    return {
      pathname: "/(tabs)/requests",
      params: {
        requestId,
        tab: requestTab ?? "approval",
      },
    };
  }

  if (
    (input.type === "shift_request_approved" ||
      input.type === "shift_request_rejected") &&
    requestId
  ) {
    return {
      pathname: "/(tabs)/requests",
      params: {
        requestId,
        tab: "mine",
      },
    };
  }

  if (input.type.startsWith("shift_request")) {
    return "/(tabs)/requests";
  }

  if (input.type === "system" || input.type.startsWith("impersonation")) {
    return "/(tabs)/profile";
  }

  return "/(tabs)/me";
}

function getNotificationIconName(type: string): keyof typeof Ionicons.glyphMap {
  if (type === "schedule_published" || type === "shift_change") {
    return "calendar-outline";
  }

  if (
    type === "shift_request_new" ||
    type === "shift_request_approved" ||
    type === "shift_request_rejected"
  ) {
    return "swap-horizontal-outline";
  }

  return "notifications-outline";
}

function getNotificationsQueryKey(accessToken: string | null) {
  return ["mobile", "notifications", accessToken] as const;
}

export default function NotificationsScreen() {
  const accessToken = useAccessToken();
  const [updatingNotificationId, setUpdatingNotificationId] = useState<
    string | null
  >(null);
  const [markingAll, setMarkingAll] = useState(false);
  const { pushToast } = useToast();
  const notificationsQuery = useQuery({
    queryKey: getNotificationsQueryKey(accessToken),
    queryFn: () => getNotifications(accessToken!),
    enabled: Boolean(accessToken),
  });
  const manualRefresh = useManualRefresh(() => notificationsQuery.refetch());
  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.readAt),
    [notifications],
  );
  const readNotifications = useMemo(
    () => notifications.filter((notification) => notification.readAt),
    [notifications],
  );
  const contentState = getMobileQueryContentState({
    hasData: notifications.length > 0,
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
  });

  function syncUnreadCount(unreadCount: number) {
    queryClient.setQueryData(
      ["mobile", "bootstrap", accessToken],
      (current: { unreadNotificationCount: number } | undefined) =>
        current
          ? {
              ...current,
              unreadNotificationCount: unreadCount,
            }
          : current,
    );
  }

  function syncNotificationsInBackground() {
    void notificationsQuery.refetch().catch(() => {});
  }

  function markNotificationReadInCache(notificationId: string, unreadCount: number) {
    if (!accessToken) {
      return;
    }

    const readAt = new Date().toISOString();
    queryClient.setQueryData(
      getNotificationsQueryKey(accessToken),
      (current: MobileNotificationsFeed | undefined) =>
        current
          ? {
              ...current,
              unreadCount,
              notifications: current.notifications.map((notification) =>
                notification.id === notificationId && !notification.readAt
                  ? { ...notification, readAt }
                  : notification,
              ),
            }
          : current,
    );
  }

  function markAllNotificationsReadInCache(unreadCount: number) {
    if (!accessToken) {
      return;
    }

    const readAt = new Date().toISOString();
    queryClient.setQueryData(
      getNotificationsQueryKey(accessToken),
      (current: MobileNotificationsFeed | undefined) =>
        current
          ? {
              ...current,
              unreadCount,
              notifications: current.notifications.map((notification) =>
                notification.readAt
                  ? notification
                  : { ...notification, readAt }
              ),
            }
          : current,
    );
  }

  async function handleMarkRead(notificationId: string) {
    if (!accessToken || updatingNotificationId || markingAll) {
      return false;
    }

    setUpdatingNotificationId(notificationId);

    try {
      const response = await markNotificationRead(accessToken, notificationId);
      markNotificationReadInCache(notificationId, response.unreadCount);
      syncUnreadCount(response.unreadCount);
      syncNotificationsInBackground();
      return true;
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update alerts",
        fallbackMessage: "We couldn't update that alert.",
      });
      return false;
    } finally {
      setUpdatingNotificationId(null);
    }
  }

  async function handleOpenNotification(input: {
    id: string;
    metadata: Record<string, unknown>;
    readAt: string | null;
    type: string;
  }) {
    if (!input.readAt) {
      const didMarkRead = await handleMarkRead(input.id);
      if (!didMarkRead) {
        return;
      }
    }

    router.push(
      getNotificationDestination({
        metadata: input.metadata,
        type: input.type,
      }),
    );
  }

  async function handleMarkAllRead() {
    if (!accessToken || unreadNotifications.length === 0 || markingAll) {
      return;
    }

    setMarkingAll(true);

    try {
      const response = await markAllNotificationsRead(accessToken);
      markAllNotificationsReadInCache(response.unreadCount);
      syncUnreadCount(response.unreadCount);
      syncNotificationsInBackground();
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update alerts",
        fallbackMessage: "We couldn't update your alerts.",
      });
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Screen
      bottomPaddingMode="stack"
      title="Alerts"
      subtitle="Alerts"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {unreadNotifications.length > 0 ? (
        <View style={styles.actionRow}>
          <Text style={styles.actionCopy}>
            {unreadNotifications.length} unread
          </Text>
          <Button
            compact
            disabled={markingAll}
            label={markingAll ? "Updating..." : "Mark all read"}
            onPress={() => {
              void handleMarkAllRead();
            }}
            tone="secondary"
          />
        </View>
      ) : null}

      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading alerts</Text>
          <Text style={styles.loadingBody}>
            Pulling the latest schedule and request activity into mobile.
          </Text>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load alerts"
          onAction={() => {
            void notificationsQuery.refetch();
          }}
        />
      ) : contentState.kind === "empty" ? (
        <EmptyStateCard
          body="Schedule publishes and request approvals will show up here."
          iconName="notifications-outline"
          title="No alerts yet"
        />
      ) : (
        <>
          {unreadNotifications.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Unread</Text>
              {unreadNotifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  accessibilityRole="button"
                  android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
                  onPress={() => {
                    void handleOpenNotification(notification);
                  }}
                  style={styles.alertCard}
                >
                  <View style={styles.alertHeader}>
                    <View style={styles.alertTitleRow}>
                      <View style={styles.alertIconFrame}>
                        <Ionicons
                          color={mobileColors.brand}
                          name={getNotificationIconName(notification.type)}
                          size={18}
                        />
                      </View>
                      <Text style={styles.alertTitle}>{notification.title}</Text>
                    </View>
                    <View style={styles.unreadDot} />
                  </View>
                  <Text style={styles.alertMessage}>{notification.message}</Text>
                  <Text style={styles.alertMeta}>
                    {updatingNotificationId === notification.id
                      ? "Updating..."
                      : formatRelativeTime(notification.createdAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {readNotifications.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Earlier</Text>
              {readNotifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  accessibilityRole="button"
                  android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
                  onPress={() => {
                    void handleOpenNotification(notification);
                  }}
                  style={styles.alertCardMuted}
                >
                  <View style={styles.alertTitleRow}>
                    <View style={styles.alertIconFrameMuted}>
                      <Ionicons
                        color={mobileColors.textMuted}
                        name={getNotificationIconName(notification.type)}
                        size={18}
                      />
                    </View>
                    <Text style={styles.alertTitleMuted}>{notification.title}</Text>
                  </View>
                  <Text style={styles.alertMessage}>{notification.message}</Text>
                  <Text style={styles.alertMeta}>
                    {formatRelativeTime(notification.createdAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  loadingState: {
    gap: 14,
  },
  loadingTitle: {
    ...mobileText.screenTitle,
    color: mobileColors.textPrimary,
  },
  loadingBody: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  actionCopy: {
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    ...mobileText.label,
    color: mobileColors.textSubtle,
    textTransform: "uppercase",
  },
  alertCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  alertCardMuted: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderRadius: mobileRadii.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  alertTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  alertIconFrame: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.brandSoft,
  },
  alertIconFrameMuted: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.surface,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: mobileColors.brand,
  },
  alertTitle: {
    ...mobileText.cardTitle,
    flex: 1,
    color: mobileColors.textPrimary,
  },
  alertTitleMuted: {
    ...mobileText.cardTitle,
    color: mobileColors.textSecondary,
    flex: 1,
  },
  alertMessage: {
    ...mobileText.body,
    color: mobileColors.textSecondary,
  },
  alertMeta: {
    ...mobileText.caption,
    color: mobileColors.textSubtle,
  },
});
