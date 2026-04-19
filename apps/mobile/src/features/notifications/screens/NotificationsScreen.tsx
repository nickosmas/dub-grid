import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../shared/components/Button";
import { Card, Screen } from "../../../shared/components/Screen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../../shared/lib/api";
import { queryClient } from "../../../shared/lib/query-client";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import {
  mobileColors,
  mobileRadii,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";

export default function NotificationsScreen() {
  const accessToken = useAccessToken();
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingNotificationId, setUpdatingNotificationId] = useState<
    string | null
  >(null);
  const [markingAll, setMarkingAll] = useState(false);
  const notificationsQuery = useQuery({
    queryKey: ["mobile", "notifications", accessToken],
    queryFn: () => getNotifications(accessToken!),
    enabled: Boolean(accessToken),
  });
  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadNotifications = notifications.filter(
    (notification) => !notification.readAt,
  );
  const readNotifications = notifications.filter(
    (notification) => notification.readAt,
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

  async function handleMarkRead(notificationId: string) {
    if (!accessToken || updatingNotificationId || markingAll) {
      return;
    }

    setUpdatingNotificationId(notificationId);
    setActionError(null);

    try {
      const response = await markNotificationRead(accessToken, notificationId);
      syncUnreadCount(response.unreadCount);
      await notificationsQuery.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We couldn't update that alert.",
      );
    } finally {
      setUpdatingNotificationId(null);
    }
  }

  async function handleMarkAllRead() {
    if (!accessToken || unreadNotifications.length === 0 || markingAll) {
      return;
    }

    setMarkingAll(true);
    setActionError(null);

    try {
      const response = await markAllNotificationsRead(accessToken);
      syncUnreadCount(response.unreadCount);
      await notificationsQuery.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We couldn't update your alerts.",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Screen
      title="Alerts"
      subtitle="Alerts"
      refreshing={notificationsQuery.isFetching || markingAll}
      onRefresh={() => {
        void notificationsQuery.refetch();
      }}
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

      {actionError ? (
        <QueryStateCard
          title="Could not update alerts"
          body={actionError}
          actionLabel="Try Again"
          onAction={() => {
            void notificationsQuery.refetch();
          }}
        />
      ) : null}

      {contentState.kind === "loading" ? (
        <QueryStateCard
          title="Loading alerts"
          body="Pulling the latest schedule and request activity into mobile."
        />
      ) : contentState.kind === "error" ? (
        <QueryStateCard
          title="Could not load alerts"
          body={contentState.message}
          actionLabel="Try Again"
          onAction={() => {
            void notificationsQuery.refetch();
          }}
        />
      ) : contentState.kind === "empty" ? (
        <Card
          title="No alerts yet"
          body="Schedule publishes and request approvals will show up here."
        />
      ) : (
        <>
          {unreadNotifications.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Unread</Text>
              {unreadNotifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  onPress={() => {
                    void handleMarkRead(notification.id);
                  }}
                  style={styles.alertCard}
                >
                  <View style={styles.alertHeader}>
                    <Text style={styles.alertTitle}>{notification.title}</Text>
                    <View style={styles.unreadDot} />
                  </View>
                  <Text style={styles.alertMessage}>{notification.message}</Text>
                  <Text style={styles.alertMeta}>
                    {updatingNotificationId === notification.id
                      ? "Updating..."
                      : "Tap to mark read"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {readNotifications.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Earlier</Text>
              {readNotifications.map((notification) => (
                <View key={notification.id} style={styles.alertCardMuted}>
                  <Text style={styles.alertTitleMuted}>{notification.title}</Text>
                  <Text style={styles.alertMessage}>{notification.message}</Text>
                </View>
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
  actionCopy: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  alertCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  alertCardMuted: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderRadius: mobileRadii.card,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  alertTitle: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  alertTitleMuted: {
    color: mobileColors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
  alertMessage: {
    color: mobileColors.textMuted,
    lineHeight: 20,
  },
  alertMeta: {
    color: mobileColors.brand,
    fontSize: 13,
    fontWeight: "700",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: mobileColors.danger,
  },
});
