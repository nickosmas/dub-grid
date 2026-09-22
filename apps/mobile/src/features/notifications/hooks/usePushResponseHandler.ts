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

// A cold start delivers the tapped notification through
// `getLastNotificationResponseAsync()`, and a warm app can deliver the *same*
// tap through the response listener. Remember what we've already routed so the
// two paths can't double-navigate.
//
// Module-scoped on purpose: `getLastNotificationResponseAsync()` keeps
// returning the launching response for the whole process lifetime, so an
// effect-scoped guard would re-navigate every time this hook remounted.
let lastHandledResponseId: string | null = null;

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

    function handleResponse(response: Notifications.NotificationResponse) {
      // A tap that lands after this mount is gone belongs to whoever is
      // signed in now, which may be nobody or somebody else.
      if (cancelled) return;
      const responseId = response.notification.request.identifier;
      if (responseId && responseId === lastHandledResponseId) {
        return;
      }
      lastHandledResponseId = responseId ?? null;

      const data = response.notification.request.content.data as
        Record<string, unknown> | undefined;
      navigateForPayload(data ?? null);
    }

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
        handleResponse(response);
      });

      // Registered before the await below, and run immediately if this effect
      // was already torn down: assigning it afterwards left both listeners
      // attached whenever the hook unmounted while the cold-start lookup was
      // still in flight, and the stale response listener then navigated a
      // signed-out or different session.
      cleanup = () => {
        receivedSub.remove();
        responseSub.remove();
      };
      if (cancelled) {
        cleanup();
        cleanup = null;
        return;
      }

      // The listener above only fires while the app is running. When the app was
      // killed and is launched *by* a notification tap, the tap is replayed here
      // instead — without this, a cold-start tap silently lands on Home.
      const initialResponse = await notifications.getLastNotificationResponseAsync();
      if (!cancelled && initialResponse) {
        handleResponse(initialResponse);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [enabled, queryClient]);
}
