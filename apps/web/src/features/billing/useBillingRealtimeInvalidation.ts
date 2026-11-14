"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@/lib/sentry";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { queryKeys } from "@/lib/query-keys";
import { orgTopic, subscribeToTableChanges } from "@dubgrid/realtime-core";
import { getBrowserSupabaseClient } from "@/features/account/client";

export function getBillingRealtimeInvalidationKeys(orgId: string): readonly unknown[][] {
  return [
    [...queryKeys.org.billing(orgId)],
    [...queryKeys.org.bootstrap()],
    [...queryKeys.org.detail(orgId)],
  ];
}

export function useBillingRealtimeInvalidation(orgId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const invalidateBilling = () => {
      for (const queryKey of getBillingRealtimeInvalidationKeys(orgId)) {
        void queryClient.invalidateQueries({ queryKey });
        broadcastInvalidation(queryKey);
      }
    };

    return subscribeToTableChanges(
      getBrowserSupabaseClient(),
      [
        { table: "organizations", topic: orgTopic(orgId), onEvent: invalidateBilling },
        { table: "subscriptions", topic: orgTopic(orgId), onEvent: invalidateBilling },
      ],
      {
        onReconnectAfterError: invalidateBilling,
        onError: (error) => {
          Sentry.captureException(error);
        },
      },
    );
  }, [orgId, queryClient]);
}
