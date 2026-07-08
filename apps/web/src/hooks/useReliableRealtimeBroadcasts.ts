"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type BroadcastPayload = Record<string, unknown>;

export interface ReliableBroadcastOptions {
  key?: string;
  merge?: (current: BroadcastPayload, next: BroadcastPayload) => BroadcastPayload;
}

interface PendingBroadcast {
  event: string;
  payload: BroadcastPayload;
}

export function useReliableRealtimeBroadcasts(
  channelRef: MutableRefObject<RealtimeChannel | null>,
) {
  const nextAutoKeyRef = useRef(0);
  const pendingBroadcastsRef = useRef<Map<string, PendingBroadcast>>(new Map());
  const pendingOrderRef = useRef<string[]>([]);
  const flushInFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const flushPendingBroadcasts = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || channel.state !== "joined") return;
    if (flushInFlightRef.current) return;

    flushInFlightRef.current = true;
    clearRetryTimer();

    try {
      while (pendingOrderRef.current.length > 0) {
        const key = pendingOrderRef.current[0];
        const pending = pendingBroadcastsRef.current.get(key);

        if (!pending) {
          pendingOrderRef.current.shift();
          continue;
        }

        const status = await channel.send({
          type: "broadcast",
          event: pending.event,
          payload: pending.payload,
        });

        if (status !== "ok") {
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              void flushPendingBroadcasts();
            }, 400);
          }
          break;
        }

        if (pendingBroadcastsRef.current.get(key) === pending) {
          pendingBroadcastsRef.current.delete(key);
          pendingOrderRef.current.shift();
        }
      }
    } catch {
      if (!retryTimerRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void flushPendingBroadcasts();
        }, 400);
      }
    } finally {
      flushInFlightRef.current = false;
      if (
        pendingOrderRef.current.length > 0 &&
        channelRef.current?.state === "joined" &&
        !retryTimerRef.current
      ) {
        void flushPendingBroadcasts();
      }
    }
  }, [channelRef, clearRetryTimer]);

  const sendBroadcast = useCallback(
    (event: string, payload: BroadcastPayload = {}, options?: ReliableBroadcastOptions) => {
      const key = options?.key ?? `${event}:${nextAutoKeyRef.current++}`;
      const current = pendingBroadcastsRef.current.get(key);
      const nextPayload =
        current && options?.merge ? options.merge(current.payload, payload) : payload;

      pendingBroadcastsRef.current.set(key, {
        event,
        payload: nextPayload,
      });

      if (!current) {
        pendingOrderRef.current.push(key);
      }

      void flushPendingBroadcasts();
    },
    [flushPendingBroadcasts],
  );

  const clearPendingBroadcast = useCallback((key: string) => {
    pendingBroadcastsRef.current.delete(key);
    pendingOrderRef.current = pendingOrderRef.current.filter((pendingKey) => pendingKey !== key);
  }, []);

  const resetPendingBroadcasts = useCallback(() => {
    clearRetryTimer();
    pendingBroadcastsRef.current.clear();
    pendingOrderRef.current = [];
    flushInFlightRef.current = false;
  }, [clearRetryTimer]);

  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  return {
    sendBroadcast,
    flushPendingBroadcasts,
    clearPendingBroadcast,
    resetPendingBroadcasts,
  };
}
