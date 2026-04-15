"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  disablePostHog,
  enablePostHog,
  identifyUser,
  resetPostHog,
} from "@/lib/posthog";
import {
  getAnalyticsConsentSnapshot,
  subscribeToConsentChanges,
} from "@/components/CookieConsent";

/**
 * Initializes PostHog and identifies the user.
 * Gated on analytics cookie consent — only initializes if the user
 * has accepted analytics cookies.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const hasConsent = useSyncExternalStore(
    subscribeToConsentChanges,
    getAnalyticsConsentSnapshot,
    () => false,
  );

  useEffect(() => {
    if (!hasConsent) {
      disablePostHog();
      return;
    }

    enablePostHog();

    if (user) {
      identifyUser(user.id, { email: user.email });
    } else {
      resetPostHog();
    }
  }, [hasConsent, user]);

  return <>{children}</>;
}
