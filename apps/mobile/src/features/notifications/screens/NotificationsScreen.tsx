import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../../shared/components/Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { MobileNotification } from "@dubgrid/contracts";
import { extractNotificationAction } from "@dubgrid/domain";
import { AnimatedListItem } from "../../../shared/motion/AnimatedListItem";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { SearchBar } from "../../../shared/components/SearchBar";
import { Screen } from "../../../shared/components/Screen";
import {
  ScrollableTabStrip,
  ScrollableTabStripSkeleton,
} from "../../../shared/components/ScrollableTabStrip";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useMobileNotificationsRealtimeTick } from "../hooks/useMobileNotificationsRealtimeTick";
import { useNotificationFacets } from "../hooks/useNotificationFacets";
import {
  isNotificationActionSupportedOnMobile,
  openNotificationAction,
} from "../lib/openNotificationAction";
import { filterNotificationsForViewer } from "../lib/notification-visibility";
import {
  bulkUpdateNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type MobileNotificationsListParams,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { queryClient } from "../../../shared/lib/query-client";
import { setBootstrapUnreadCount } from "../lib/unread-cache";
import { CardRowListSkeleton } from "../../../shared/components/skeleton";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "schedule", label: "Schedule" },
  { key: "shift_requests", label: "Requests" },
  { key: "system", label: "System" },
  { key: "archived", label: "Archived" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

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
  // Over a week old — name the year, since "May 4" alone can't place it.
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

  const bootstrapQuery = useBootstrap(accessToken);
  const canApproveShiftRequests = Boolean(
    bootstrapQuery.data?.permissions.canApproveShiftRequests,
  );
  const facetsQuery = useNotificationFacets(accessToken);
  const facets = facetsQuery.data;

  const filterCounts: Record<FilterKey, number> = {
    all: facets?.totalInbox ?? 0,
    unread: facets?.totalUnread ?? 0,
    schedule: facets?.byCategory?.schedule ?? 0,
    shift_requests: facets?.byCategory?.shift_requests ?? 0,
    system: facets?.byCategory?.system ?? 0,
    archived: facets?.totalArchived ?? 0,
  };
  const filterTabs = FILTERS.map((entry) => ({
    key: entry.key,
    label: entry.label,
    count: filterCounts[entry.key],
  }));

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
    // Search text and the filter chip are both in the query key, so every
    // keystroke is a new query. Without this the list blanks to nothing while
    // the new key resolves; with it the previous results stay on screen and
    // simply swap when the new ones land.
    placeholderData: keepPreviousData,
  });

  // Alerts are addressed by role at send time, but a role can change after one
  // is sent: an approver who has since become a regular user would otherwise
  // keep a backlog of other people's approval requests they can no longer act
  // on. Filtered here rather than server-side so a re-promotion restores them.
  const notifications = useMemo(
    () =>
      filterNotificationsForViewer(
        notificationsQuery.data?.pages.flatMap((page) => page.notifications) ?? [],
        { canApproveShiftRequests: canApproveShiftRequests },
      ),
    [canApproveShiftRequests, notificationsQuery.data],
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

  const contentState = useMobileContentState({
    // "The query resolved", not "the list is non-empty". Search and filter are
    // both in the query key, so a keystroke used to empty `notifications` while
    // `isLoading` flipped back to true, repainting the skeleton over a list the
    // user was reading. An empty *result* is the `empty` state, not `loading`.
    hasData: notificationsQuery.data !== undefined,
    isEmpty: notifications.length === 0,
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
  });

  function syncBootstrapUnread(count: number) {
    setBootstrapUnreadCount(queryClient, accessToken, count);
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
      // Same as People: the search field sits at the top, so the keyboard
      // inset buys nothing and costs a jump when the large title recalculates.
      adjustsForKeyboard={false}
      bottomPaddingMode="stack"
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

        {/* Held back until the facets land: every tab carries a count, and
            painting the strip first made each badge pop in afterwards and shove
            the pills along once the screen finished loading. */}
        {contentState.kind === "loading" ? (
          contentState.showSkeleton ? (
            <ScrollableTabStripSkeleton tabs={filterTabs.length} />
          ) : null
        ) : (
          <ScrollableTabStrip
            accessibilityLabel="Alert filters"
            activeKey={filter}
            onSelect={(key) => setFilter(key as FilterKey)}
            tabs={filterTabs}
          />
        )}
      </View>
      {unreadCount > 0 ? (
        <View style={styles.actionRow}>
          <Text style={styles.actionCopy}>{unreadCount} unread</Text>
          <Button
            compact
            label="Mark all read"
            loading={busy}
            onPress={() => setConfirmingMarkAllRead(true)}
            tone="secondary"
          />
        </View>
      ) : null}

      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <CardRowListSkeleton rows={4} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load alerts"
          variant="centered"
          onAction={() => notificationsQuery.refetch()}
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
          {notifications.map((notification, index) => (
            <AnimatedListItem index={index} key={notification.id}>
              <NotificationCard
                notification={notification}
                onPress={() => handleRowPress(notification)}
                onArchive={() => handleArchive(notification)}
              />
            </AnimatedListItem>
          ))}
          {notificationsQuery.hasNextPage ? (
            <Button
              compact
              tone="secondary"
              label="Load more"
              loading={notificationsQuery.isFetchingNextPage}
              onPress={() => notificationsQuery.fetchNextPage()}
            />
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
        onConfirm={() => handleMarkAllRead()}
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
          <Button
            fullWidth={false}
            icon="arrow-forward"
            iconPosition="trailing"
            label={action.label}
            onPress={(event) => {
              // Sits inside a pressable row; without this the row navigates too.
              event.stopPropagation?.();
              openNotificationAction(action.href);
            }}
            size="sm"
            tone="secondary"
          />
        ) : action ? (
          <View style={styles.webOnlyHint}>
            <Ionicons name="globe-outline" size={14} color={mobileColors.textMuted} />
            <Text style={styles.webOnlyHintLabel}>Complete on web</Text>
          </View>
        ) : (
          <View />
        )}
        <Button
          accessibilityLabel={isArchived ? "Restore from archive" : "Archive"}
          icon={isArchived ? "archive" : "archive-outline"}
          iconOnly
          onPress={(event) => {
            // Sits inside a pressable row; without this the row navigates too.
            event.stopPropagation?.();
            onArchive();
          }}
          size="sm"
          tone="ghost"
        />
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
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
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
      borderColor: mobileColors.cardBorder,
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
      ...mobileTextWeighted("caption", "bold"),
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
      ...mobileTextWeighted("label", "semibold"),
      color: mobileColors.textMuted,
    },
  });
