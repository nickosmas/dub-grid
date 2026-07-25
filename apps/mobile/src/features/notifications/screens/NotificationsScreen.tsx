import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { MobileNotification } from "@dubgrid/contracts";
import { extractNotificationAction } from "@dubgrid/domain";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { SearchBar } from "../../../shared/components/SearchBar";
import { ListSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useMobileNotificationsRealtimeTick } from "../hooks/useMobileNotificationsRealtimeTick";
import { useNotificationFacets } from "../hooks/useNotificationFacets";
import {
  isNotificationActionSupportedOnMobile,
  openNotificationAction,
} from "../lib/openNotificationAction";
import {
  bulkUpdateNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type MobileNotificationsListParams,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { queryClient } from "../../../shared/lib/query-client";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileRadii,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";

type FilterChip =
  | { key: "all"; label: "All" }
  | { key: "unread"; label: "Unread" }
  | { key: "schedule"; label: "Schedule" }
  | { key: "shift_requests"; label: "Requests" }
  | { key: "system"; label: "System" }
  | { key: "archived"; label: "Archived" };

const FILTER_CHIPS: FilterChip[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "schedule", label: "Schedule" },
  { key: "shift_requests", label: "Requests" },
  { key: "system", label: "System" },
  { key: "archived", label: "Archived" },
];

type FilterKey = FilterChip["key"];

const PAGE_SIZE = 25;

function chipToParams(filter: FilterKey): Partial<MobileNotificationsListParams> {
  switch (filter) {
    case "unread":
      return { read: "unread" };
    case "schedule":
      return { category: "schedule" };
    case "shift_requests":
      return { category: "shift_requests" };
    case "system":
      return { category: "system" };
    case "archived":
      return { archived: "archived" };
    default:
      return {};
  }
}

function getNotificationsQueryKey(accessToken: string | null, filter: FilterKey, search: string) {
  return ["mobile", "notifications-infinite", accessToken, filter, search] as const;
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

function formatRelativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.floor(diff / 60000), 0);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function NotificationsScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingMarkAllRead, setConfirmingMarkAllRead] = useState(false);

  const facetsQuery = useNotificationFacets(accessToken);
  const facets = facetsQuery.data;

  const chipCounts: Record<FilterKey, number> = {
    all: facets?.totalInbox ?? 0,
    unread: facets?.totalUnread ?? 0,
    schedule: facets?.byCategory?.schedule ?? 0,
    shift_requests: facets?.byCategory?.shift_requests ?? 0,
    system: facets?.byCategory?.system ?? 0,
    archived: facets?.totalArchived ?? 0,
  };

  const queryKey = getNotificationsQueryKey(accessToken, filter, debouncedSearch);

  const notificationsQuery = useInfiniteQuery({
    queryKey,
    enabled: Boolean(accessToken),
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const params: MobileNotificationsListParams = {
        limit: PAGE_SIZE,
        ...chipToParams(filter),
        cursorCreatedAt: pageParam?.createdAt,
        cursorId: pageParam?.id,
        search: debouncedSearch || undefined,
      };
      return getNotifications(accessToken!, params);
    },
    getNextPageParam: (lastPage) =>
      lastPage.notifications.length >= PAGE_SIZE ? lastPage.nextCursor : null,
  });

  const notifications = useMemo(
    () => notificationsQuery.data?.pages.flatMap((p) => p.notifications) ?? [],
    [notificationsQuery.data],
  );

  const unreadCount = notificationsQuery.data?.pages[0]?.unreadCount ?? 0;

  const manualRefresh = useManualRefresh(async () => {
    await notificationsQuery.refetch();
  });

  const { session } = useSessionState();
  const handleRealtimeChange = useCallback(() => {
    // Bypassing invalidation-only refresh: if the user is still on page 1,
    // refetch the list directly; otherwise only refresh facets/counts so an
    // in-progress scroll through older pages isn't disrupted.
    if (notifications.length <= PAGE_SIZE) {
      void notificationsQuery.refetch();
    } else {
      void facetsQuery.refetch();
    }
  }, [facetsQuery, notifications.length, notificationsQuery]);
  useMobileNotificationsRealtimeTick({
    userId: session?.user?.id ?? null,
    onChange: handleRealtimeChange,
  });

  const contentState = getMobileQueryContentState({
    hasData: notifications.length > 0,
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
  });

  function syncBootstrapUnread(count: number) {
    queryClient.setQueryData(
      ["mobile", "bootstrap", accessToken],
      (current: { unreadNotificationCount: number } | undefined) =>
        current ? { ...current, unreadNotificationCount: count } : current,
    );
  }

  const handleRowPress = useCallback(
    async (notification: MobileNotification) => {
      if (!accessToken) return;
      if (!notification.readAt) {
        try {
          const response = await markNotificationRead(accessToken, notification.id);
          syncBootstrapUnread(response.unreadCount);
          void Promise.all([notificationsQuery.refetch(), facetsQuery.refetch()]);
        } catch (error) {
          pushClientFriendlyErrorToast(pushToast, {
            error,
            title: "Could not update alerts",
            fallbackMessage: "We couldn't mark that alert as read.",
          });
          return;
        }
      }
      router.push({
        pathname: "/alerts/[id]",
        params: { id: notification.id },
      });
    },
    [accessToken, facetsQuery, notificationsQuery, pushToast],
  );

  const handleArchive = useCallback(
    async (notification: MobileNotification) => {
      if (!accessToken || busy) return;
      setBusy(true);
      try {
        const action = notification.archivedAt ? "unarchive" : "archive";
        const response = await bulkUpdateNotifications(accessToken, {
          ids: [notification.id],
          action,
        });
        syncBootstrapUnread(response.unreadCount);
        await Promise.all([notificationsQuery.refetch(), facetsQuery.refetch()]);
        pushToast({
          tone: "success",
          message: action === "archive" ? "Archived" : "Restored",
        });
      } catch (error) {
        pushClientFriendlyErrorToast(pushToast, {
          error,
          title: "Could not update alerts",
          fallbackMessage: "We couldn't archive that alert.",
        });
      } finally {
        setBusy(false);
      }
    },
    [accessToken, busy, facetsQuery, notificationsQuery, pushToast],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!accessToken || unreadCount === 0 || busy) return;
    setBusy(true);
    try {
      const response = await markAllNotificationsRead(accessToken);
      syncBootstrapUnread(response.unreadCount);
      await Promise.all([notificationsQuery.refetch(), facetsQuery.refetch()]);
      pushToast({ tone: "success", message: "All alerts marked read" });
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update alerts",
        fallbackMessage: "We couldn't mark all alerts as read.",
      });
    } finally {
      setBusy(false);
      setConfirmingMarkAllRead(false);
    }
  }, [accessToken, busy, facetsQuery, notificationsQuery, pushToast, unreadCount]);

  return (
    <Screen
      bottomPaddingMode="stack"
      title="Alerts"
      subtitle="Alerts"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      <View style={styles.headerArea}>
        <SearchBar
          accessibilityLabel="Search alerts"
          onChangeText={setSearchInput}
          onDebouncedChange={(value) => setDebouncedSearch(value.trim())}
          placeholder="Search title or message"
          value={searchInput}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {FILTER_CHIPS.map((chip) => {
            const active = filter === chip.key;
            const count = chipCounts[chip.key];
            return (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(chip.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
                {count > 0 ? (
                  <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                    <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>
                      {count > 9 ? "9+" : count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {unreadCount > 0 ? (
        <View style={styles.actionRow}>
          <Text style={styles.actionCopy}>{unreadCount} unread</Text>
          <Button
            compact
            disabled={busy}
            label={busy ? "Updating..." : "Mark all read"}
            onPress={() => setConfirmingMarkAllRead(true)}
            tone="secondary"
          />
        </View>
      ) : null}

      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load alerts"
          variant="centered"
          onAction={() => {
            void notificationsQuery.refetch();
          }}
        />
      ) : contentState.kind === "empty" ? (
        <EmptyStateCard
          fillScreen
          body={
            debouncedSearch || filter !== "all"
              ? "Try clearing your filters or search."
              : "Schedule updates and request decisions will appear here."
          }
          iconName="notifications-outline"
          title={debouncedSearch || filter !== "all" ? "No matching alerts" : "No alerts yet"}
        />
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onPress={() => {
                void handleRowPress(notification);
              }}
              onArchive={() => {
                void handleArchive(notification);
              }}
            />
          ))}
          {notificationsQuery.hasNextPage ? (
            <Button
              compact
              tone="secondary"
              disabled={notificationsQuery.isFetchingNextPage}
              label={notificationsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
              onPress={() => {
                void notificationsQuery.fetchNextPage();
              }}
            />
          ) : null}
          {notificationsQuery.isFetchingNextPage ? (
            <ActivityIndicator color={mobileColors.brand} />
          ) : null}
        </View>
      )}
      <ConfirmationModal
        body={
          unreadCount === 1
            ? "Mark your one unread alert as read?"
            : `Mark all ${unreadCount} unread alerts as read?`
        }
        cancelLabel="Cancel"
        confirmLabel="Mark all read"
        confirmTone="primary"
        loading={busy}
        onCancel={() => setConfirmingMarkAllRead(false)}
        onConfirm={() => {
          void handleMarkAllRead();
        }}
        title="Mark all read"
        visible={confirmingMarkAllRead}
      />
    </Screen>
  );
}

interface NotificationCardProps {
  notification: MobileNotification;
  onPress: () => void;
  onArchive: () => void;
}

function NotificationCard({ notification, onPress, onArchive }: NotificationCardProps) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isUnread = !notification.readAt;
  const isArchived = !!notification.archivedAt;
  const action = extractNotificationAction(notification.metadata);
  const actionSupported = action ? isNotificationActionSupportedOnMobile(action.href) : false;

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      onPress={onPress}
      style={[styles.alertCard, !isUnread && styles.alertCardMuted]}
    >
      <View style={styles.alertHeader}>
        <View style={styles.alertTitleRow}>
          <View style={[styles.alertIconFrame, !isUnread && styles.alertIconFrameMuted]}>
            <Ionicons
              color={isUnread ? mobileColors.brand : mobileColors.textMuted}
              name={getNotificationIconName(notification.type)}
              size={18}
            />
          </View>
          <View style={styles.titleColumn}>
            <View style={styles.titleLine}>
              {notification.priority === "critical" || notification.priority === "high" ? (
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
              ) : null}
              <Text style={[styles.alertTitle, !isUnread && styles.alertTitleMuted]}>
                {notification.title}
              </Text>
              {typeof notification.metadata?.groupCount === "number" &&
              notification.metadata.groupCount > 1 ? (
                <Text style={styles.groupBadge}>×{notification.metadata.groupCount as number}</Text>
              ) : null}
            </View>
            <Text style={styles.alertMessage}>{notification.message}</Text>
            <Text style={styles.alertMeta}>{formatRelativeTime(notification.createdAt)}</Text>
          </View>
        </View>
        {isUnread ? <View style={styles.unreadDot} /> : null}
      </View>
      <View style={styles.cardActions}>
        {action && actionSupported ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={(event) => {
              event.stopPropagation?.();
              openNotificationAction(action.href);
            }}
            style={({ pressed }) => [styles.ctaPill, pressed && styles.ctaPillPressed]}
          >
            <Text style={styles.ctaPillLabel}>{action.label}</Text>
            <Ionicons name="arrow-forward" size={14} color={mobileColors.brand} />
          </Pressable>
        ) : action ? (
          <View style={styles.webOnlyHint}>
            <Ionicons name="globe-outline" size={14} color={mobileColors.textMuted} />
            <Text style={styles.webOnlyHintLabel}>Complete on web</Text>
          </View>
        ) : (
          <View />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isArchived ? "Restore from archive" : "Archive"}
          onPress={(event) => {
            event.stopPropagation?.();
            onArchive();
          }}
          style={({ pressed }) => [styles.archiveButton, pressed && styles.archiveButtonPressed]}
          hitSlop={6}
        >
          <Ionicons
            name={isArchived ? "archive" : "archive-outline"}
            size={16}
            color={mobileColors.textMuted}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    headerArea: {
      gap: 10,
      paddingBottom: 10,
    },
    chipScroll: {
      marginHorizontal: -mobileSpacing.screenX,
    },
    chipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: mobileSpacing.screenX,
      paddingVertical: 2,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
    },
    chipActive: {
      borderColor: mobileColors.brand,
      backgroundColor: mobileColors.brand,
    },
    chipText: {
      fontSize: 14,
      fontWeight: "700",
      color: mobileColors.textSecondary,
    },
    chipTextActive: {
      color: mobileColors.textInverse,
    },
    chipBadge: {
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    chipBadgeActive: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    chipBadgeText: {
      ...mobileText.badge,
      color: mobileColors.textMuted,
      textAlign: "center",
    },
    chipBadgeTextActive: {
      color: mobileColors.textInverse,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    loadingState: {
      gap: 14,
    },
    actionCopy: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    list: {
      gap: 10,
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
    },
    alertHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    alertTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      flex: 1,
    },
    titleColumn: {
      flex: 1,
      gap: 4,
    },
    titleLine: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
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
      color: mobileColors.textPrimary,
    },
    alertTitleMuted: {
      color: mobileColors.textSecondary,
    },
    alertMessage: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    alertMeta: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    priorityChip: {
      ...mobileText.caption,
      fontWeight: "700",
      color: mobileColors.danger,
      letterSpacing: 0.5,
    },
    priorityCritical: {
      color: mobileColors.danger,
    },
    priorityHigh: {
      color: mobileColors.warning,
    },
    groupBadge: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
      backgroundColor: mobileColors.surfaceSecondary,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 999,
    },
    cardActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginLeft: 42,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
    ctaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.brandSoft,
    },
    ctaPillPressed: {
      backgroundColor: mobileColors.brandBorder,
    },
    ctaPillLabel: {
      ...mobileText.label,
      color: mobileColors.brand,
      fontWeight: "600",
    },
    webOnlyHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surfaceMuted,
    },
    webOnlyHintLabel: {
      ...mobileText.label,
      color: mobileColors.textMuted,
      fontWeight: "600",
    },
    archiveButton: {
      width: 36,
      height: 36,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    archiveButtonPressed: {
      backgroundColor: mobileColors.surfaceSecondary,
    },
  });
