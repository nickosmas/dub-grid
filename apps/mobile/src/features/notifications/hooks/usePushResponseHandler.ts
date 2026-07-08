import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Platform } from "react-native";
import type * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const pushUnsupported = Platform.OS === "web" || isExpoGo;

// Lazy-load expo-notifications so importing this hook in Expo Go doesn't
// trigger the module's import-time "remote push removed in SDK 53" error.
async function loadNotifications(): Promise<typeof Notifications | null> {
  if (pushUnsupported) return null;
  return await import("expo-notifications");
}

const NOTIFICATION_HANDLER_OPTIONS: Notifications.NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
  // Older expo-notifications types still expect this field; harmless on newer SDKs.
  shouldShowAlert: true,
} as Notifications.NotificationBehavior;

let handlerInstalled = false;
function installForegroundHandler(notifications: typeof Notifications) {
  if (handlerInstalled) return;
  handlerInstalled = true;
  notifications.setNotificationHandler({
    handleNotification: async () => NOTIFICATION_HANDLER_OPTIONS,
  });
}

function navigateForPayload(data: Record<string, unknown> | null | undefined) {
  if (!data) {
    router.push("/alerts");
    return;
  }

  const notificationId = typeof data.notificationId === "string" ? data.notificationId : null;

  if (notificationId) {
    router.push({
      pathname: "/alerts/[id]",
      params: { id: notificationId },
    });
    return;
  }

  const type = typeof data.type === "string" ? data.type : "";
  if (type.startsWith("shift_request")) {
    router.push("/(tabs)/requests");
    return;
  }
  if (type === "schedule_published" || type === "shift_change") {
    router.push("/(tabs)/home");
    return;
  }

  router.push("/alerts");
}

/**
 * Wires up Expo notification listeners so:
 * - foreground pushes show a banner instead of being suppressed,
 * - new pushes invalidate the inbox query so the list updates immediately,
 * - tapping a push navigates to the relevant deep link.
 *
 * Mount once at the root of the authed app (e.g. (tabs)/_layout.tsx).
 */
export function usePushResponseHandler(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || pushUnsupported) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const notifications = await loadNotifications();
      if (!notifications || cancelled) return;

      installForegroundHandler(notifications);

      const receivedSub = notifications.addNotificationReceivedListener(() => {
        void queryClient.invalidateQueries({
          queryKey: ["mobile", "notifications-infinite"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["mobile", "bootstrap"],
        });
      });

      const responseSub = notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          Record<string, unknown> | undefined;
        navigateForPayload(data ?? null);
      });

      cleanup = () => {
        receivedSub.remove();
        responseSub.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [enabled, queryClient]);
}
