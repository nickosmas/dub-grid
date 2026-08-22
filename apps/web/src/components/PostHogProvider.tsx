"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/AuthProvider";
import { disablePostHog, enablePostHog, identifyUser, resetPostHog } from "@/lib/posthog";
import { getAnalyticsConsentSnapshot, subscribeToConsentChanges } from "@/components/CookieConsent";

/**
 * Initializes PostHog and identifies the user.
 * Gated on analytics cookie consent — only initializes if the user
 * has accepted analytics cookies — and on the platform-wide "posthog" kill
 * switch, evaluated server-side once at page load and passed down as `enabled`
 * (a live toggle would need a client-side poll; this flag changes rarely
 * enough that "takes effect on next navigation" is an acceptable trade-off).
 */
export default function PostHogProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const hasConsent = useSyncExternalStore(
    subscribeToConsentChanges,
    getAnalyticsConsentSnapshot,
    () => false,
  );

  useEffect(() => {
    if (!enabled || !hasConsent) {
      disablePostHog();
      return;
    }

    // enablePostHog now downloads the SDK before it can opt in, so the identify
    // has to wait for it — called eagerly it would run against a null client
    // and be dropped.
    let cancelled = false;
    void (async () => {
      await enablePostHog();
      if (cancelled) return;
      if (user) {
        identifyUser(user.id, { email: user.email });
      } else {
        resetPostHog();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, hasConsent, user]);

  return <>{children}</>;
}
