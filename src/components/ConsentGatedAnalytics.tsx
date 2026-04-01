"use client";

import { useState, useEffect } from "react";
import { Analytics } from "@vercel/analytics/next";
import { getCookieConsent, CONSENT_CHANGED_EVENT } from "@/components/CookieConsent";

/**
 * Renders Vercel Analytics only when the user has accepted analytics cookies.
 * Listens for consent changes so it can mount/unmount without a full page reload.
 */
export default function ConsentGatedAnalytics() {
  const [hasConsent, setHasConsent] = useState(
    () => typeof window !== "undefined" && getCookieConsent()?.analytics === true,
  );

  useEffect(() => {
    function onConsentChanged() {
      setHasConsent(getCookieConsent()?.analytics === true);
    }

    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
  }, []);

  if (!hasConsent) return null;
  return <Analytics />;
}
