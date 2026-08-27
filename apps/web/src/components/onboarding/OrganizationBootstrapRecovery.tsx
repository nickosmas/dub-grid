"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";

interface OrganizationBootstrapRecoveryProps {
  onRetry: () => Promise<void>;
  automaticallyRetry?: boolean;
}

const RETRY_DEADLINE_MS = 15_000;

/**
 * The organization bootstrap is the one request the authenticated shell cannot
 * operate without. Keep an exhausted retry here, before any onboarding step
 * that relies on `org`, so a transient failure never becomes an empty shell.
 */
export default function OrganizationBootstrapRecovery({
  onRetry,
  automaticallyRetry = true,
}: OrganizationBootstrapRecoveryProps) {
  const [retrying, setRetrying] = useState(false);
  const [automaticRetryCount, setAutomaticRetryCount] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const retryInFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const retry = useCallback(async () => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    try {
      // Query cancellation is not available for every caller. Bound the UI
      // latch anyway: a stalled fetch must not make manual recovery
      // permanently unavailable.
      await Promise.race([
        onRetry(),
        new Promise<void>((resolve) => window.setTimeout(resolve, RETRY_DEADLINE_MS)),
      ]);
    } finally {
      retryInFlight.current = false;
      if (mounted.current) {
        setRetrying(false);
      }
    }
  }, [onRetry]);

  useEffect(() => {
    // The query itself already has a short, bounded retry budget. Once that
    // is exhausted, keep reconnecting in the background without turning a
    // provider outage into a permanent client-side dead end. The delay caps
    // at 30 seconds so a prolonged outage does not create retry pressure.
    if (!automaticallyRetry || !online) return;
    const cappedDelay = Math.min(5_000 * 2 ** automaticRetryCount, 30_000);
    // Full jitter prevents a large cohort recovering from the same outage from
    // immediately recreating a synchronized bootstrap spike.
    const delay = Math.round(cappedDelay * (0.5 + Math.random() * 0.5));
    const timer = window.setTimeout(() => {
      void retry().finally(() => {
        if (mounted.current) {
          setAutomaticRetryCount((count) => count + 1);
        }
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [automaticRetryCount, retry]);

  return (
    <AuthTransitionScreen
      phase="organization"
      offline={!online}
      onRetry={retry}
      retrying={retrying}
    />
  );
}
