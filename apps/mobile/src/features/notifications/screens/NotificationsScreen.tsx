import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import type { MobileNotification, MobileNotificationsResponse } from "@dubgrid/contracts";
import { resolveAlertDestination } from "@dubgrid/domain";
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
import {
  WEB_ONLY_ALERT_MESSAGE,
  openNotificationAction,
  resolveNativeRoute,
} from "../lib/openNotificationAction";
import { NotificationRowListSkeleton } from "../components/NotificationRowListSkeleton";
import { SkeletonLine } from "../../../shared/components/skeleton";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
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

  // Flip one row's read state in the cached pages without a refetch, so the
  // list reflects a tap at once and can be put back if the write fails.
  const patchNotificationReadAt = useCallback(
    (id: string, readAt: string | null) => {
      queryClient.setQueryData<InfiniteData<MobileNotificationsResponse>>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                notifications: page.notifications.map((entry) =>
                  entry.id === id ? { ...entry, readAt } : entry,
                ),
              })),
            }
          : current,
      );
    },
    [queryKey],
  );

  const handleRowPress = useCallback(
    (notification: MobileNotification) => {
      if (!accessToken) return;
      // Go first. Waiting on the read write before navigating cost every tap
      // a network round trip, which read as lag; the write now runs behind
      // the navigation with the row already marked, and a failure puts the
      // row back and says so.
      const destination = resolveAlertDestination(notification);
      if (destination && resolveNativeRoute(destination.href)) {
        openNotificationAction(destination.href);
      } else {
        pushToast({ tone: "info", message: WEB_ONLY_ALERT_MESSAGE });
      }
      if (notification.readAt) return;
      patchNotificationReadAt(notification.id, new Date().toISOString());
      markNotificationRead(accessToken, notification.id)
        .then((response) => {
          syncBootstrapUnread(response.unreadCount);
          void Promise.all([notificationsQuery.refetch(), facetsQuery.refetch()]);
        })
        .catch((error) => {
          patchNotificationReadAt(notification.id, null);
          pushClientFriendlyErrorToast(pushToast, {
            error,
            title: "Could not update alerts",
            fallbackMessage: "We couldn't mark that alert as read.",
          });
        });
    },
    [accessToken, facetsQuery, notificationsQuery, patchNotificationReadAt, pushToast],
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

  // Virtualized: every "Load more" used to append another page of mounted
  // rows to the page's scroll view, so a long history grew without bound
  // (F-31). Rows now mount only near the viewport; the search, filters and
  // unread row stay as the list header. The bleed past the gutter and the
  // per-row inset are unchanged, so a swiped row's actions still reach the
  // screen edge.
  const listItems = contentState.kind === "ready" ? notifications : [];

  return (
    <Screen
      // Same as People: the search field sits at the top, so the keyboard
      // inset buys nothing and costs a jump when the large title recalculates.
      adjustsForKeyboard={false}
      bottomPaddingMode="stack"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      scrollEnabled={contentState.kind !== "loading"}
      list={{
        data: listItems,
        keyExtractor: (notification) => notification.id,
        itemSeparator: <View style={styles.divider} />,
        renderItem: (notification) => (
          <NotificationRow
            openRegistry={openSwipe}
            notification={notification}
            onPress={() => handleRowPress(notification)}
            onToggleRead={() => handleToggleRead(notification)}
            onArchive={() => handleArchive(notification)}
          />
        ),
        headerGap: mobileSpace.md,
        listFooter: notificationsQuery.hasNextPage ? (
          <View style={styles.loadMore}>
            <Button
              compact
              tone="secondary"
              label="Load more"
              loading={notificationsQuery.isFetchingNextPage}
              onPress={() => notificationsQuery.fetchNextPage()}
            />
          </View>
        ) : null,
      }}
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
        {/* The unread row is almost always there once the facets land, so the
            placeholder holds its height and the list does not drop on load.
            Its action is a text button, so the placeholder is a text line. */}
        {contentState.kind === "loading" && contentState.showSkeleton ? (
          <View style={styles.actionRow}>
            <SkeletonLine variant="sectionTitle" width={104} />
            <SkeletonLine variant="bodyStrong" width={112} />
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
              tone="link"
            />
          </View>
        ) : null}
        {/* Inside the header block so the placeholder rows sit the same
            compact gap below the unread row that the real rows do. */}
        {contentState.kind === "loading" && contentState.showSkeleton ? (
          <NotificationRowListSkeleton />
        ) : null}
      </View>

      {contentState.kind === "loading" ? null : contentState.kind === "error" ? (
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
      ) : null}
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
    // Rows are list items outside the header's gutter, and each row pads
    // itself back to the gutter, so a swiped row's actions reach the edge.
    loadMore: {
      marginHorizontal: getScreenGutter(),
      marginTop: mobileSpace.lg,
      marginBottom: mobileSpace.md,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
      marginHorizontal: getScreenGutter(),
    },
  });
