import { useEffect, useMemo, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileNotification } from "@dubgrid/contracts";
import { resolveAlertDestination } from "@dubgrid/domain";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { getNotifications, markNotificationRead } from "../../../shared/lib/api";
import { getClientFriendlyErrorMessage } from "../../../shared/lib/errors";
import { useSkeletonGate } from "../../../shared/hooks/useSkeletonGate";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { NotificationDetailSkeleton } from "../components/NotificationDetailSkeleton";
import { setBootstrapUnreadCount } from "../lib/unread-cache";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isNotificationVisibleToViewer } from "../lib/notification-visibility";
import {
  WEB_ONLY_ALERT_MESSAGE,
  openNotificationAction,
  resolveNativeRoute,
} from "../lib/openNotificationAction";

/**
 * `/alerts/[id]` is where a push tap and older deep links arrive. An alert is
 * one sentence about something else, so the screen does not show it again:
 * it marks the alert read and forwards to what it is about. A destination
 * the app does not have falls back to the inbox with a hint.
 */
export default function NotificationDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const id = typeof params.id === "string" ? params.id : null;
  const bootstrapQuery = useBootstrap(accessToken);
  const canApproveShiftRequests = Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests);

  // Look in any cached notifications-infinite query for this id.
  const cachedNotification = useMemo<MobileNotification | null>(() => {
    if (!id) return null;
    const matches = queryClient
      .getQueriesData<{ pages?: { notifications: MobileNotification[] }[] }>({
        queryKey: mobileQueryKeys.notificationsPrefix(accessToken),
      })
      .flatMap(([, data]) => data?.pages?.flatMap((p) => p.notifications) ?? []);
    return matches.find((n) => n.id === id) ?? null;
  }, [accessToken, id, queryClient]);

  // Fallback: hit the API once if we don't already have it cached.
  const detailQuery = useQuery({
    queryKey: mobileQueryKeys.notificationDetail(accessToken, id),
    enabled: Boolean(accessToken && id && !cachedNotification),
    queryFn: async ({ signal }) => {
      // By id, not the first page: a link can name an alert far older than
      // anything the inbox has loaded, and searching a page silently failed
      // for those.
      const page = await getNotifications(
        accessToken!,
        {
          id: id!,
          limit: 1,
          archived: "any",
        },
        signal,
      );
      return page.notifications.find((n) => n.id === id) ?? null;
    },
  });

  const resolvedNotification = cachedNotification ?? detailQuery.data ?? null;
  // Same role gate the inbox applies, so a push tap or a stale deep link can't
  // walk around it into an alert the viewer's role no longer covers.
  const notification =
    resolvedNotification &&
    isNotificationVisibleToViewer(resolvedNotification, { canApproveShiftRequests })
      ? resolvedNotification
      : null;
  // In flight, or not started yet because the access token has not hydrated.
  const isResolvingNotification =
    detailQuery.isLoading || (!accessToken && Boolean(id) && !cachedNotification);
  const showSkeleton = useSkeletonGate(!notification && isResolvingNotification);

  // Forward exactly once per alert; a refetch or a token refresh must not
  // push a second screen.
  const forwardedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!notification || !accessToken || forwardedIdRef.current === notification.id) return;
    forwardedIdRef.current = notification.id;

    if (!notification.readAt) {
      markNotificationRead(accessToken, notification.id)
        .then((response) => setBootstrapUnreadCount(queryClient, accessToken, response.unreadCount))
        .catch(() => {
          // best-effort; the inbox refetches on its own
        });
    }

    const destination = resolveAlertDestination(notification);
    if (destination && resolveNativeRoute(destination.href)) {
      openNotificationAction(destination.href, "replace");
      return;
    }
    pushToast({ tone: "info", message: WEB_ONLY_ALERT_MESSAGE });
    router.replace("/alerts");
  }, [accessToken, notification, pushToast, queryClient]);

  if (!notification && isResolvingNotification) {
    return (
      <Screen scrollEnabled={false}>{showSkeleton ? <NotificationDetailSkeleton /> : null}</Screen>
    );
  }

  // A failed fetch first: "no longer accessible" has to mean the server
  // answered and the alert genuinely was not there.
  if (!notification && detailQuery.error) {
    return (
      <Screen>
        <StatusBanner
          actionLabel="Try again"
          body={getClientFriendlyErrorMessage(
            detailQuery.error,
            "We couldn't load that alert right now.",
          )}
          fillScreen
          title="Could not load this alert"
          variant="centered"
          onAction={() => {
            void detailQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!notification) {
    return (
      <Screen>
        <EmptyStateCard
          fillScreen
          body="That alert is no longer accessible."
          iconName="notifications-off-outline"
          title="Alert not available"
        />
      </Screen>
    );
  }

  // The forward is in flight; keep the placeholder up rather than a flash of nothing.
  return (
    <Screen scrollEnabled={false}>
      <NotificationDetailSkeleton />
    </Screen>
  );
}
