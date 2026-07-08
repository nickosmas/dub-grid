"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import {
  createBrowserRealtimeChannel,
  removeBrowserRealtimeChannel,
} from "@/features/account/client";

export function getBillingRealtimeInvalidationKeys(orgId: string): readonly unknown[][] {
  return [
    [...queryKeys.org.billing(orgId)],
    [...queryKeys.org.bootstrapAll()],
    [...queryKeys.org.detail(orgId)],
  ];
}

export function useBillingRealtimeInvalidation(orgId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    let hadError = false;
    const channelId = `billing-freshness:${orgId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = createBrowserRealtimeChannel(channelId);
    const invalidateBilling = () => {
      for (const queryKey of getBillingRealtimeInvalidationKeys(orgId)) {
        void queryClient.invalidateQueries({ queryKey });
        broadcastInvalidation(queryKey);
      }
    };

    channel
      .on(
        "postgres_changes" as "system",
        {
          event: "*",
          schema: "public",
          table: "organizations",
          filter: `id=eq.${orgId}`,
        } as Record<string, unknown>,
        invalidateBilling,
      )
      .on(
        "postgres_changes" as "system",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `org_id=eq.${orgId}`,
        } as Record<string, unknown>,
        invalidateBilling,
      )
      .subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED" && hadError) {
          hadError = false;
          invalidateBilling();
        } else if (status === "CHANNEL_ERROR") {
          hadError = true;
          Sentry.captureException(err ?? new Error("billing freshness channel error"));
        }
      });

    return () => {
      void removeBrowserRealtimeChannel(channel);
    };
  }, [orgId, queryClient]);
}
