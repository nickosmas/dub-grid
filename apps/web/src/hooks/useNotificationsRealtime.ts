"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@/lib/sentry";
import { queryKeys } from "@/lib/query-keys";
import {
  createBrowserRealtimeChannel,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";

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

    let hadError = false;
    const channelId = `notifications:user:${userId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = createBrowserRealtimeChannel(channelId);

    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all(userId),
      });
      onChange?.();
    };

    channel.on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      } as Record<string, unknown>,
      () => invalidate(),
    );

    channel.subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED" && hadError) {
        hadError = false;
        invalidate();
      } else if (status === "CHANNEL_ERROR") {
        hadError = true;
        Sentry.captureException(
          err ?? new Error("notifications realtime channel error"),
        );
      }
    });

    return () => {
      void removeBrowserRealtimeChannel(channel);
    };
  }, [disabled, userId, queryClient, onChange]);
}
