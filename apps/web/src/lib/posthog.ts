import { clientEnv } from "@/lib/env";
/**
 * PostHog wrapper.
 *
 * posthog-js is loaded with a dynamic import, not a static one. This module is
 * reached from PostHogProvider, which lives in the root layout, so a static
 * import shipped the whole SDK in the initial bundle of *every* route — the
 * landing page, /login, the public policy pages — even when analytics consent
 * was denied or the platform kill switch was off. The consent gate only ever
 * prevented `init`, never the download.
 *
 * Everything below no-ops while the SDK is unloaded, which is the correct
 * behaviour: with no client there is nothing to identify, capture or reset.
 */
type PostHogClient = typeof import("posthog-js").default;

let client: PostHogClient | null = null;
let loading: Promise<PostHogClient | null> | null = null;

/** Loads and initializes the SDK once. Concurrent callers share one import. */
function loadAndInit(): Promise<PostHogClient | null> {
  if (loading) return loading;

  const key = clientEnv?.NEXT_PUBLIC_POSTHOG_KEY;
  const host = clientEnv?.NEXT_PUBLIC_POSTHOG_HOST;
  if (typeof window === "undefined" || !key || !host) {
    return Promise.resolve(null);
  }

  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: "localStorage+cookie",
        autocapture: false, // manual events only
      });
      client = posthog;
      return posthog;
    })
    .catch(() => {
      // A failed analytics download must never take a page down with it.
      // Reset so a later opt-in can retry.
      loading = null;
      return null;
    });

  return loading;
}

/**
 * Load, initialize and opt in. Await it before calling identifyUser — until it
 * resolves there is no client, and the identify would be dropped.
 */
export async function enablePostHog(): Promise<void> {
  const posthog = await loadAndInit();
  posthog?.opt_in_capturing();
}

export function disablePostHog() {
  if (!client) return;
  client.opt_out_capturing();
  client.reset();
}

/** Identify the current user for PostHog. */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!client || client.has_opted_out_capturing()) return;
  client.identify(userId, properties);
}

/** Reset PostHog identity (on logout). */
export function resetPostHog() {
  if (!client) return;
  client.reset();
}

/** Capture a custom event. */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!client || client.has_opted_out_capturing()) return;
  client.capture(event, properties);
}

/** Evaluate a feature flag (client-side). */
export function getFeatureFlag(flag: string): boolean | string | undefined {
  if (!client || client.has_opted_out_capturing()) return undefined;
  return client.getFeatureFlag(flag) as boolean | string | undefined;
}
