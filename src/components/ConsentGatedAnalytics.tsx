"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { getCookieConsent, CONSENT_CHANGED_EVENT } from "@/components/CookieConsent";

function subscribeToConsent(callback: () => void) {
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

function getSnapshot() {
  return getCookieConsent()?.analytics === true;
}

function getServerSnapshot() {
  return false;
}

/**
 * Renders Vercel Analytics only when the user has accepted analytics cookies.
 * Subscribes to consent changes via useSyncExternalStore to avoid hydration mismatches.
 */
export default function ConsentGatedAnalytics() {
  const hasConsent = useSyncExternalStore(subscribeToConsent, getSnapshot, getServerSnapshot);

  if (!hasConsent) return null;
  return <Analytics />;
}
