import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileNotification } from "@dubgrid/contracts";
import { extractNotificationAction, formatNotificationMetadata } from "@dubgrid/domain";
import { Button } from "../../../shared/components/Button";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  bulkUpdateNotifications,
  getNotifications,
  markNotificationRead,
} from "../../../shared/lib/api";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useSkeletonGate } from "../../../shared/hooks/useSkeletonGate";
import { NotificationDetailSkeleton } from "../components/NotificationDetailSkeleton";
import { setBootstrapUnreadCount } from "../lib/unread-cache";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import {
  isNotificationActionSupportedOnMobile,
  openNotificationAction,
} from "../lib/openNotificationAction";

function formatFullTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  if (type === "impersonation_start" || type === "impersonation_end") {
    return "shield-outline";
  }
  return "notifications-outline";
}

function MetadataList({ metadata }: { metadata: Record<string, unknown> }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const entries = formatNotificationMetadata(metadata);
  if (!entries.length) return null;
  return (
    <View style={styles.metadataCard}>
      <Text style={styles.metadataTitle}>Details</Text>
      {entries.map((entry) => (
        <View key={entry.label} style={styles.metadataRow}>
          <Text style={styles.metadataKey}>{entry.label}</Text>
          <Text style={styles.metadataValue}>{entry.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function NotificationDetailScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const params = useLocalSearchParams<{ id: string }>();
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const id = typeof params.id === "string" ? params.id : null;
  const [busy, setBusy] = useState(false);

  // Look in any cached notifications-infinite query for this id.
  const cachedNotification = useMemo<MobileNotification | null>(() => {
    if (!id) return null;
    const matches = queryClient
      .getQueriesData<{ pages?: { notifications: MobileNotification[] }[] }>({
        queryKey: ["mobile", "notifications-infinite"],
      })
      .flatMap(([, data]) => data?.pages?.flatMap((p) => p.notifications) ?? []);
    return matches.find((n) => n.id === id) ?? null;
  }, [id, queryClient]);

  // Fallback: hit the API once if we don't already have it cached.
  const detailQuery = useQuery({
    queryKey: ["mobile", "notification-detail", accessToken, id],
    enabled: Boolean(accessToken && id && !cachedNotification),
    queryFn: async () => {
      const page = await getNotifications(accessToken!, {
        limit: 100,
        archived: "any",
      });
      return page.notifications.find((n) => n.id === id) ?? null;
    },
  });

  const notification = cachedNotification ?? detailQuery.data ?? null;
  // In flight, or not started yet because the access token has not hydrated.
  const isResolvingNotification =
    detailQuery.isLoading || (!accessToken && Boolean(id) && !cachedNotification);
  // Almost always a cache hit from the list you tapped through, so the
  // placeholder only paints when the fallback fetch actually takes a moment.
  const showSkeleton = useSkeletonGate(!notification && isResolvingNotification);

  const manualRefresh = useManualRefresh(async () => {
    await detailQuery.refetch();
  });

  const handleMarkRead = useCallback(async () => {
    if (!accessToken || !notification || notification.readAt) return;
    try {
      const response = await markNotificationRead(accessToken, notification.id);
      // Drop the badge here rather than waiting for a bootstrap refetch, which
      // otherwise leaves a count on screen for an alert already being read.
      setBootstrapUnreadCount(queryClient, accessToken, response.unreadCount);
    } catch {
      // best-effort; UI updates via query refetch on parent
    }
  }, [accessToken, notification, queryClient]);

  // Auto mark-read once when an unread notification is opened.
  useEffect(() => {
    if (notification && !notification.readAt) {
      void handleMarkRead();
    }
  }, [handleMarkRead, notification]);

  const performAction = useCallback(
    async (action: "archive" | "unarchive" | "unread") => {
      if (!accessToken || !notification || busy) return;
      setBusy(true);
      try {
        await bulkUpdateNotifications(accessToken, {
          ids: [notification.id],
          action,
        });
        await queryClient.invalidateQueries({
          queryKey: ["mobile", "notifications-infinite"],
        });
        const successMessage =
          action === "archive"
            ? "Archived"
            : action === "unarchive"
              ? "Restored"
              : "Marked as unread";
        pushToast({ tone: "success", message: successMessage });
        if (action === "archive") {
          router.back();
        } else {
          await queryClient.invalidateQueries({
            queryKey: ["mobile", "notification-detail"],
          });
        }
      } catch (error) {
        pushClientFriendlyErrorToast(pushToast, {
          error,
          title: "Could not update alert",
          fallbackMessage: "We couldn't update that alert.",
        });
      } finally {
        setBusy(false);
      }
    },
    [accessToken, busy, notification, pushToast, queryClient],
  );

  const action = useMemo(
    () => extractNotificationAction(notification?.metadata ?? null),
    [notification?.metadata],
  );
  const actionSupported = action ? isNotificationActionSupportedOnMobile(action.href) : false;

  const handleOpenAction = useCallback(() => {
    if (!action) return;
    openNotificationAction(action.href);
  }, [action]);

  if (!id) {
    return (
      <Screen>
        <StatusBanner
          body="The alert id is missing."
          fillScreen
          title="Alert not found"
          variant="centered"
        />
      </Screen>
    );
  }

  // `isLoading` alone is not enough: while the session is still hydrating the
  // query is disabled, so it reports "not loading" with no data, and the branch
  // below declared the alert missing until the token arrived. "Still resolving"
  // has to cover the not-yet-started case too.
  if (!notification && isResolvingNotification) {
    return <Screen>{showSkeleton ? <NotificationDetailSkeleton /> : null}</Screen>;
  }

  if (!notification) {
    return (
      <Screen>
        <EmptyStateCard
          fillScreen
          iconName="notifications-off-outline"
          title="Alert not available"
          body="That alert is no longer accessible."
        />
      </Screen>
    );
  }

  const isArchived = !!notification.archivedAt;

  return (
    <Screen onRefresh={manualRefresh.refresh} refreshing={manualRefresh.isRefreshing}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconFrame}>
            <Ionicons
              name={getNotificationIconName(notification.type)}
              size={24}
              color={mobileColors.brand}
            />
          </View>
          {(notification.priority === "critical" || notification.priority === "high") && (
            <Text
              style={[
                styles.priorityChip,
                notification.priority === "critical"
                  ? styles.priorityCritical
                  : styles.priorityHigh,
              ]}
            >
              {notification.priority.toUpperCase()}
            </Text>
          )}
        </View>

        <Text style={styles.title}>{notification.title}</Text>
        <Text style={styles.timestamp}>{formatFullTimestamp(notification.createdAt)}</Text>
        <Text style={styles.message}>{notification.message}</Text>

        {action && actionSupported ? (
          <Button tone="primary" label={action.label} onPress={handleOpenAction} />
        ) : action ? (
          <View style={styles.webOnlyHint}>
            <Ionicons name="globe-outline" size={16} color={mobileColors.textMuted} />
            <Text style={styles.webOnlyHintLabel}>
              This action isn't available in the mobile app. Sign in on the web to complete it.
            </Text>
          </View>
        ) : null}

        <MetadataList metadata={notification.metadata} />

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => {
              void performAction("unread");
            }}
            style={styles.actionButton}
            disabled={busy || !notification.readAt}
            accessibilityRole="button"
            accessibilityLabel="Mark unread"
          >
            <Ionicons name="mail-unread-outline" size={18} color={mobileColors.textPrimary} />
            <Text style={styles.actionLabel}>Mark unread</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void performAction(isArchived ? "unarchive" : "archive");
            }}
            style={styles.actionButton}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={isArchived ? "Restore from archive" : "Archive"}
          >
            <Ionicons
              name={isArchived ? "archive" : "archive-outline"}
              size={18}
              color={mobileColors.textPrimary}
            />
            <Text style={styles.actionLabel}>{isArchived ? "Restore" : "Archive"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    container: {
      gap: 14,
      paddingBottom: 24,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconFrame: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: mobileColors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    priorityChip: {
      ...mobileTextWeighted("caption", "bold"),
      letterSpacing: 0.5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    priorityCritical: {
      color: mobileColors.danger,
      backgroundColor: mobileColors.dangerSoft,
    },
    priorityHigh: {
      color: mobileColors.warning,
      backgroundColor: mobileColors.warningSoft,
    },
    title: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    webOnlyHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: mobileRadii.control,
      backgroundColor: mobileColors.surfaceMuted,
    },
    webOnlyHintLabel: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      flexShrink: 1,
    },
    timestamp: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    message: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
      lineHeight: 22,
    },
    metadataCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      padding: 14,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      gap: 8,
    },
    metadataTitle: {
      ...mobileTextWeighted("label", "bold"),
      color: mobileColors.textPrimary,
      marginBottom: 4,
    },
    metadataRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    metadataKey: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    metadataValue: {
      ...mobileText.caption,
      color: mobileColors.textPrimary,
      flexShrink: 1,
      textAlign: "right",
    },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surface,
    },
    actionLabel: {
      ...mobileTextWeighted("label", "semibold"),
      color: mobileColors.textPrimary,
    },
  });
