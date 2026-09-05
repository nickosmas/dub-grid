"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
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

/**
 * Broadcast retry schedule.
 *
 * A flat retry never escalated and never gave up, so a sustained outage retried
 * forever with nothing surfaced, and a sleeping machine woke to a burst of due
 * timers. Backoff spreads that out, the cap keeps recovery quick, and jitter
 * stops every editor retrying in lockstep after a shared outage.
 */
const BROADCAST_RETRY_BASE_MS = 400;
const BROADCAST_RETRY_MAX_MS = 10_000;
const BROADCAST_RETRY_MAX_ATTEMPTS = 8;

function backoffDelay(attempt: number): number {
  const exponential = Math.min(BROADCAST_RETRY_BASE_MS * 2 ** attempt, BROADCAST_RETRY_MAX_MS);
  return exponential / 2 + Math.random() * (exponential / 2);
}

export function useReliableRealtimeBroadcasts(
  channelRef: MutableRefObject<RealtimeChannel | null>,
) {
  const nextAutoKeyRef = useRef(0);
  const pendingBroadcastsRef = useRef<Map<string, PendingBroadcast>>(new Map());
  const pendingOrderRef = useRef<string[]>([]);
  const flushInFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  /**
   * Set once retries are exhausted. Without it the drain loop re-enters
   * immediately: giving up schedules no timer, and the loop's only guard was
   * the absence of one, so a failing send span into unbounded recursion.
   */
  const retryExhaustedRef = useRef(false);
  const [isBroadcastDegraded, setIsBroadcastDegraded] = useState(false);

  const clearRetryTimer = useCallback(() => {
    if (!retryTimerRef.current) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const scheduleRetry = useCallback((flush: () => void) => {
    if (retryTimerRef.current) return;
    if (retryAttemptRef.current >= BROADCAST_RETRY_MAX_ATTEMPTS) {
      // Out of attempts. Surface it instead of retrying silently forever; a
      // later success clears the flag and resets the schedule.
      retryExhaustedRef.current = true;
      setIsBroadcastDegraded(true);
      return;
    }
    const delay = backoffDelay(retryAttemptRef.current);
    retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      flush();
    }, delay);
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
          scheduleRetry(() => void flushPendingBroadcasts());
          break;
        }

        if (pendingBroadcastsRef.current.get(key) === pending) {
          pendingBroadcastsRef.current.delete(key);
          pendingOrderRef.current.shift();
        }
      }
    } catch {
      scheduleRetry(() => void flushPendingBroadcasts());
    } finally {
      flushInFlightRef.current = false;
      if (pendingOrderRef.current.length === 0) {
        retryAttemptRef.current = 0;
        retryExhaustedRef.current = false;
        setIsBroadcastDegraded((degraded) => (degraded ? false : degraded));
      }
      if (
        pendingOrderRef.current.length > 0 &&
        channelRef.current?.state === "joined" &&
        !retryTimerRef.current &&
        !retryExhaustedRef.current
      ) {
        void flushPendingBroadcasts();
      }
    }
  }, [channelRef, clearRetryTimer, scheduleRetry]);

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
    retryAttemptRef.current = 0;
    retryExhaustedRef.current = false;
    setIsBroadcastDegraded(false);
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
    /** True once broadcast retries are exhausted; clears when the queue drains. */
    isBroadcastDegraded,
  };
}
