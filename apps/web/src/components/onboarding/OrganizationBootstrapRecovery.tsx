"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";

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
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const onlineRef = useRef(online);
  const retryInFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = useCallback(async () => {
    if (retryInFlight.current) return retryInFlight.current;
    setRetrying(true);
    const current = settleWithRequestTimeout(Promise.resolve().then(onRetry), RETRY_DEADLINE_MS)
      .catch(() => undefined)
      .finally(() => {
        if (retryInFlight.current === current) retryInFlight.current = null;
        if (mounted.current) setRetrying(false);
      });
    retryInFlight.current = current;
    return current;
  }, [onRetry]);

  useEffect(() => {
    const markOnline = () => {
      const reconnected = !onlineRef.current;
      onlineRef.current = true;
      setOnline(true);
      if (reconnected && automaticallyRetry) void retry();
    };
    const markOffline = () => {
      onlineRef.current = false;
      setOnline(false);
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [automaticallyRetry, retry]);

  return (
    <AuthTransitionScreen
      phase="workspace"
      offline={!online}
      onRetry={retry}
      retrying={retrying}
      showActionsImmediately
    />
  );
}
