"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToTableChanges, userTopic } from "@dubgrid/realtime-core";
import * as Sentry from "@/lib/sentry";
import { queryKeys } from "@/lib/query-keys";
import { getBrowserSupabaseClient } from "@/features/account/client";

type Listener = () => void;

/**
 * One shared channel per user, reference-counted. NotificationBell (always
 * mounted in the header) and AlertsInboxPage (mounted on /alerts) both call
 * this hook, so without dedup a visit to /alerts opened a second channel on
 * the same table+filter, doubling realtime traffic and invalidations.
 * Mirrors the org-wide dedup pattern in useOrgRealtimeInvalidation.
 */
const notificationSubscriptions = new Map<
  string,
  { count: number; listeners: Set<Listener>; unsubscribe: () => void }
>();

function acquireNotificationsSubscription(userId: string, listener: Listener): () => void {
  const existing = notificationSubscriptions.get(userId);
  if (existing) {
    existing.count += 1;
    existing.listeners.add(listener);
  } else {
    const listeners = new Set<Listener>([listener]);
    const notifyAll = () => {
      for (const fn of listeners) fn();
    };

    // One message per statement (140), so marking every alert read or
    // archiving many at once arrives once, not once per alert.
    const unsubscribe = subscribeToTableChanges(
      getBrowserSupabaseClient(),
      [{ table: "notifications", topic: userTopic(userId), onEvent: notifyAll }],
      {
        onReconnectAfterError: notifyAll,
        onError: (error) => {
          Sentry.captureException(error);
        },
      },
    );

    notificationSubscriptions.set(userId, {
      count: 1,
      listeners,
      unsubscribe,
    });
  }

  let released = false;
  return () => {
    // Guard against a double release: React can run a cleanup more than once,
    // and decrementing twice would tear down a channel other consumers hold.
    if (released) return;
    released = true;
    const entry = notificationSubscriptions.get(userId);
    if (!entry) return;
    entry.listeners.delete(listener);
    entry.count -= 1;
    if (entry.count <= 0) {
      notificationSubscriptions.delete(userId);
      entry.unsubscribe();
    }
  };
}

export function useNotificationsRealtime({
  userId,
  disabled = false,
  onChange,
}: {
  userId: string | null;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || disabled) return;

    const listener = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all(userId),
      });
      onChange?.();
    };

    return acquireNotificationsSubscription(userId, listener);
  }, [disabled, userId, queryClient, onChange]);
}
