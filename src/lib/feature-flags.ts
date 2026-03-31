import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null;
  client = new PostHog(key, { host });
  return client;
}

/**
 * Evaluate a feature flag server-side.
 * Returns the flag value, or `defaultValue` if PostHog is not configured.
 */
export async function getServerFeatureFlag(
  flag: string,
  distinctId: string,
  defaultValue: boolean | string = false,
): Promise<boolean | string> {
  const ph = getClient();
  if (!ph) return defaultValue;

  try {
    const value = await ph.getFeatureFlag(flag, distinctId);
    return value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Capture a server-side event.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
) {
  const ph = getClient();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
}
