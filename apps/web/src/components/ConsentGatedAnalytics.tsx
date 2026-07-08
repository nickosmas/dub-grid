"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { getAnalyticsConsentSnapshot, subscribeToConsentChanges } from "@/components/CookieConsent";

function getServerSnapshot() {
  return false;
}

/**
 * Renders Vercel Analytics only when the user has accepted analytics cookies.
 * Subscribes to consent changes via useSyncExternalStore to avoid hydration mismatches.
 */
export default function ConsentGatedAnalytics() {
  const hasConsent = useSyncExternalStore(
    subscribeToConsentChanges,
    getAnalyticsConsentSnapshot,
    getServerSnapshot,
  );

  if (!hasConsent) return null;
  return <Analytics />;
}
