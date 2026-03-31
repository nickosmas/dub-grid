"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { initPostHog, identifyUser, resetPostHog } from "@/lib/posthog";

/**
 * Initializes PostHog and identifies the user.
 * Gated on analytics cookie consent — only initializes if the user
 * has accepted analytics cookies.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    // Check cookie consent before initializing analytics
    try {
      const consent = document.cookie
        .split("; ")
        .find((c) => c.startsWith("dubgrid-cookie-consent="));
      if (!consent) return;
      const value = JSON.parse(decodeURIComponent(consent.split("=")[1]));
      if (!value?.analytics) return;
    } catch {
      return;
    }

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
