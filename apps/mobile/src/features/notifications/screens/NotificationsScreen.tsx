import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { MobileNotification } from "@dubgrid/contracts";
import { AnimatedListItem } from "../../../shared/motion/AnimatedListItem";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { SearchBar } from "../../../shared/components/SearchBar";
import { Screen } from "../../../shared/components/Screen";
import { getScreenGutter } from "../../../shared/components/screen-layout";
import {
  ScrollableTabStrip,
  ScrollableTabStripSkeleton,
} from "../../../shared/components/ScrollableTabStrip";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { NotificationRow, type OpenSwipeRegistry } from "../components/NotificationRow";
import { useMobileNotificationsRealtimeTick } from "../hooks/useMobileNotificationsRealtimeTick";
import { useNotificationFacets } from "../hooks/useNotificationFacets";
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
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { setBootstrapUnreadCount } from "../lib/unread-cache";
import { NotificationRowListSkeleton } from "../components/NotificationRowListSkeleton";
import { SkeletonLine, SkeletonPill } from "../../../shared/components/skeleton";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileControl,
  mobileElevation,
  mobileRadii,
  mobilePillOverflow,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
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
  return mobileQueryKeys.notifications(accessToken, { filter, search, pageSize: PAGE_SIZE });
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
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [confirmingMarkAllRead, setConfirmingMarkAllRead] = useState(false);

  const bootstrapQuery = useBootstrap(accessToken);
  const canApproveShiftRequests = Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests);
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
    queryFn: async ({ pageParam, signal }) => {
      const params: MobileNotificationsListParams = {
        limit: PAGE_SIZE,
        ...chipToParams(filter),
        cursorCreatedAt: pageParam?.createdAt,
        cursorId: pageParam?.id,
        search: debouncedSearch || undefined,
      };
      return getNotifications(accessToken!, params, signal);
    },
    getNextPageParam: (lastPage) =>
      lastPage.notifications.length >= PAGE_SIZE ? lastPage.nextCursor : null,
    // Search text and the filter chip are both in the query key, so every
    // keystroke is a new query. Without this the list blanks to nothing while
    // the new key resolves; with it the previous results stay on screen and
    // simply swap when the new ones land.
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
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

  // One open swipe at a time across the list; see `OpenSwipeRegistry`.
  const openSwipe = useRef<OpenSwipeRegistry["current"]>(null);
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
        // Navigation deliberately waits on this write (a failure keeps the user
        // here with the toast), so the row has to say it is working meanwhile.
        setPendingRowId(notification.id);
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
        } finally {
          setPendingRowId(null);
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

  const handleToggleRead = useCallback(
    async (notification: MobileNotification) => {
      if (!accessToken || busy) return;
      setBusy(true);
      try {
        const action = notification.readAt ? "unread" : "read";
        const response = await bulkUpdateNotifications(accessToken, {
          ids: [notification.id],
          action,
        });
        syncBootstrapUnread(response.unreadCount);
        await Promise.all([notificationsQuery.refetch(), facetsQuery.refetch()]);
      } catch (error) {
        pushClientFriendlyErrorToast(pushToast, {
          error,
          title: "Could not update alerts",
          fallbackMessage: "We couldn't update that alert.",
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
      scrollEnabled={contentState.kind !== "loading"}
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
      {/* The unread row is almost always there once the facets land, so the
          placeholder holds its height and the list does not drop on load. */}
      {contentState.kind === "loading" && contentState.showSkeleton ? (
        <View style={styles.actionRow}>
          <SkeletonLine variant="sectionTitle" width={104} />
          <SkeletonPill height={mobileControl.sm} width={124} />
        </View>
      ) : null}
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
          <NotificationRowListSkeleton rows={5} />
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
              {index > 0 ? <View style={styles.divider} /> : null}
              <NotificationRow
                openRegistry={openSwipe}
                pending={pendingRowId === notification.id}
                notification={notification}
                onPress={() => handleRowPress(notification)}
                onToggleRead={() => handleToggleRead(notification)}
                onArchive={() => handleArchive(notification)}
              />
            </AnimatedListItem>
          ))}
          {notificationsQuery.hasNextPage ? (
            <View style={styles.loadMore}>
              <Button
                compact
                tone="secondary"
                label="Load more"
                loading={notificationsQuery.isFetchingNextPage}
                onPress={() => notificationsQuery.fetchNextPage()}
              />
            </View>
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    headerArea: {
      gap: mobileSpace.md,
      paddingBottom: mobileSpace.md,
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
    // Rows, not cards: the list is one column with a hairline between
    // alerts, the way a mailbox reads, and the row's actions sit behind a
    // swipe rather than on a panel of their own. The column bleeds past the
    // page gutter so a swiped row's actions reach the screen edge; each row
    // pads itself back to the gutter.
    list: {
      gap: 0,
      marginHorizontal: -getScreenGutter(),
    },
    // Back inside the gutter the bleeding list gave up.
    loadMore: {
      marginHorizontal: getScreenGutter(),
      marginTop: mobileSpace.lg,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
      marginHorizontal: getScreenGutter(),
    },
  });
