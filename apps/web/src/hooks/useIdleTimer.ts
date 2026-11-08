import { useEffect, useRef, useState, useCallback } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import {
  broadcastIdleActivity,
  listenForIdleActivity,
  readIdleActivity,
  writeIdleActivity,
} from "@/lib/idle-broadcast";

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
  /**
   * The auth session this clock belongs to. With it, every tab of the session
   * shares one deadline, and a reload continues it rather than starting over.
   */
  sessionKey?: string | null;
  /** Called exactly once when the idle deadline is reached. */
  onExpire: () => void;
  /** Called on this tab's own activity, not activity another tab reported. */
  onActivity?: (at: number) => void;
}

export interface UseIdleTimerResult {
  phase: IdleTimerPhase;
  /** Seconds until expiry; only meaningful while `phase === "warning"`. */
  secondsRemaining: number;
  /** Resets the idle clock (unthrottled, even during the warning) and notifies other tabs. */
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
  sessionKey = null,
  onExpire,
  onActivity,
}: UseIdleTimerOptions): UseIdleTimerResult {
  const [phase, setPhase] = useState<IdleTimerPhase>("active");
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const onExpireRef = useLatestRef(onExpire);
  const onActivityRef = useLatestRef(onActivity);

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

  // Another tab, or this one before a reload, may have recorded later activity.
  const latestActivityAt = useCallback(() => {
    const stored = readIdleActivity(sessionKey);
    if (stored !== null && stored > lastActivityAtRef.current) {
      lastActivityAtRef.current = stored;
    }
    return lastActivityAtRef.current;
  }, [sessionKey]);

  const isPastDeadline = useCallback(
    (now: number) => now - latestActivityAt() >= timeoutMs,
    [latestActivityAt, timeoutMs],
  );

  const recompute = useCallback(() => {
    clearScheduled();
    const elapsed = Date.now() - latestActivityAt();
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
  }, [timeoutMs, warningMs, clearScheduled, latestActivityAt]);

  const registerActivity = useCallback(
    (at: number, { broadcast }: { broadcast: boolean }) => {
      if (expiredRef.current) return;
      // Strictly-less-than, not <=: a same-millisecond first activity event
      // (e.g. right at mount) must still count, not be silently dropped.
      if (at < lastActivityAtRef.current) return;
      lastActivityAtRef.current = at;
      if (broadcast) {
        broadcastIdleActivity(at, sessionKey);
        onActivityRef.current?.(at);
      }
      recompute();
    },
    [recompute, sessionKey, onActivityRef],
  );

  const stayActive = useCallback(() => {
    const now = Date.now();
    lastThrottleFlushRef.current = now;
    if (isPastDeadline(now)) {
      recompute();
      return;
    }
    registerActivity(now, { broadcast: true });
  }, [isPastDeadline, recompute, registerActivity]);

  useEffect(() => {
    if (!enabled) {
      clearScheduled();
      return;
    }

    // A stored time past the deadline, from a reload or a reopened tab, signs
    // out at once below rather than granting a fresh 30 minutes.
    const now = Date.now();
    const stored = readIdleActivity(sessionKey);
    if (stored === null) writeIdleActivity(now, sessionKey);
    lastActivityAtRef.current = stored ?? now;
    // -Infinity, not 0: guarantees the very first activity event after mount
    // is never throttled away, regardless of how soon it fires.
    lastThrottleFlushRef.current = -Infinity;
    expiredRef.current = false;
    recompute();

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastThrottleFlushRef.current < throttleMs) return;
      lastThrottleFlushRef.current = now;
      // A timer that slept with the laptop, or ran late in a hidden tab, may
      // not have fired yet: activity past the deadline signs out instead of
      // reviving the session, and once the warning is due only Stay signed
      // in extends it, so a passer-by's mouse can't.
      if (timeoutMs - (now - latestActivityAt()) <= warningMs) {
        recompute();
        return;
      }
      registerActivity(now, { broadcast: true });
    };

    const handleWake = () => {
      if (document.visibilityState === "visible") recompute();
    };

    const unlisten = listenForIdleActivity(sessionKey, (at) => {
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
  }, [enabled, sessionKey, timeoutMs, warningMs, throttleMs]);

  return { phase, secondsRemaining, stayActive };
}
