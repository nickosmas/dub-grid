"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { initPostHog, identifyUser, resetPostHog } from "@/lib/posthog";
import { hasAnalyticsConsent } from "@/components/CookieConsent";

/**
 * Initializes PostHog and identifies the user.
 * Gated on analytics cookie consent — only initializes if the user
 * has accepted analytics cookies.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (!hasAnalyticsConsent()) return;
    initPostHog();
  }, []);

  // Identify / reset user on auth changes
  useEffect(() => {
    if (user) {
      identifyUser(user.id, { email: user.email });
    } else {
      resetPostHog();
    }
  }, [user]);

  return <>{children}</>;
}
