import posthog from "posthog-js";

let initialized = false;

/**
 * Initialize PostHog client-side. Safe to call multiple times.
 * Gated on env vars and analytics consent cookie.
 */
export function initPostHog() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false, // manual events only
  });
  initialized = true;
}

export function enablePostHog() {
  initPostHog();
  if (!initialized) return;
  posthog.opt_in_capturing();
}

export function disablePostHog() {
  if (typeof window === "undefined" || !initialized) return;
  posthog.opt_out_capturing();
  posthog.reset();
}

/**
 * Identify the current user for PostHog.
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (
    typeof window === "undefined" ||
    !initialized ||
    posthog.has_opted_out_capturing()
  ) {
    return;
  }
  posthog.identify(userId, properties);
}

/**
 * Reset PostHog identity (on logout).
 */
export function resetPostHog() {
  if (typeof window === "undefined" || !initialized) return;
  posthog.reset();
}

/**
 * Capture a custom event.
 */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (
    typeof window === "undefined" ||
    !initialized ||
    posthog.has_opted_out_capturing()
  ) {
    return;
  }
  posthog.capture(event, properties);
}

/**
 * Evaluate a feature flag (client-side).
 */
export function getFeatureFlag(flag: string): boolean | string | undefined {
  if (
    typeof window === "undefined" ||
    !initialized ||
    posthog.has_opted_out_capturing()
  ) {
    return undefined;
  }
  return posthog.getFeatureFlag(flag) as boolean | string | undefined;
}

export { posthog };
