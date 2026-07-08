import { useEffect, useRef, useState, useCallback } from "react";
import { broadcastIdleActivity, listenForIdleActivity } from "@/lib/idle-broadcast";

export type IdleTimerPhase = "active" | "warning" | "expired";

export interface UseIdleTimerOptions {
  /** Total inactivity duration before expiry. Default 30 minutes. */
  timeoutMs?: number;
  /** Lead time before expiry during which `phase` is "warning". Default 60s. */
  warningMs?: number;
  /** Minimum interval between activity-triggered resets. Default 3s. */
  throttleMs?: number;
  /** When false, no listeners are attached and the timer never expires. */
  enabled: boolean;
  /** Called exactly once when the idle deadline is reached. */
  onExpire: () => void;
}

export interface UseIdleTimerResult {
  phase: IdleTimerPhase;
  /** Seconds until expiry; only meaningful while `phase === "warning"`. */
  secondsRemaining: number;
  /** Resets the idle clock immediately (unthrottled) and notifies other tabs. */
  stayActive: () => void;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_WARNING_MS = 60 * 1000;
const DEFAULT_THROTTLE_MS = 3_000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "wheel",
  "touchstart",
  "pointerdown",
  "scroll",
] as const;

export function useIdleTimer({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_MS,
  throttleMs = DEFAULT_THROTTLE_MS,
  enabled,
  onExpire,
}: UseIdleTimerOptions): UseIdleTimerResult {
  const [phase, setPhase] = useState<IdleTimerPhase>("active");
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const lastActivityAtRef = useRef(Date.now());
  const lastThrottleFlushRef = useRef(0);
  const expiredRef = useRef(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearScheduled = useCallback(() => {
    if (timeoutIdRef.current !== undefined) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = undefined;
    }
  }, []);

  const recompute = useCallback(() => {
    clearScheduled();
    const elapsed = Date.now() - lastActivityAtRef.current;
    const remaining = timeoutMs - elapsed;

    if (remaining <= 0) {
      setPhase("expired");
      setSecondsRemaining(0);
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
      return;
    }

    expiredRef.current = false;

    if (remaining <= warningMs) {
      setPhase("warning");
      setSecondsRemaining(Math.ceil(remaining / 1000));
      timeoutIdRef.current = setTimeout(recompute, Math.min(1000, remaining));
    } else {
      setPhase("active");
      timeoutIdRef.current = setTimeout(recompute, remaining - warningMs);
    }
  }, [timeoutMs, warningMs, clearScheduled]);

  const registerActivity = useCallback(
    (at: number, { broadcast }: { broadcast: boolean }) => {
      // Strictly-less-than, not <=: a same-millisecond first activity event
      // (e.g. right at mount) must still count, not be silently dropped.
      if (at < lastActivityAtRef.current) return;
      lastActivityAtRef.current = at;
      if (broadcast) broadcastIdleActivity(at);
      recompute();
    },
    [recompute],
  );

  const stayActive = useCallback(() => {
    const now = Date.now();
    lastThrottleFlushRef.current = now;
    registerActivity(now, { broadcast: true });
  }, [registerActivity]);

  useEffect(() => {
    if (!enabled) {
      clearScheduled();
      return;
    }

    lastActivityAtRef.current = Date.now();
    // -Infinity, not 0: guarantees the very first activity event after mount
    // is never throttled away, regardless of how soon it fires.
    lastThrottleFlushRef.current = -Infinity;
    expiredRef.current = false;
    recompute();

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastThrottleFlushRef.current < throttleMs) return;
      lastThrottleFlushRef.current = now;
      registerActivity(now, { broadcast: true });
    };

    const handleWake = () => {
      if (document.visibilityState === "visible") recompute();
    };

    const unlisten = listenForIdleActivity((at) => {
      registerActivity(at, { broadcast: false });
    });

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, {
        capture: true,
        passive: true,
      });
    }
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("pageshow", handleWake);

    return () => {
      clearScheduled();
      unlisten();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("pageshow", handleWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs, warningMs, throttleMs]);

  return { phase, secondsRemaining, stayActive };
}
