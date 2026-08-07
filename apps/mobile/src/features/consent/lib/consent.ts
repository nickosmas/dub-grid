import { Platform } from "react-native";
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import { secureStoreAdapter } from "../../../shared/lib/session";
import { getMobileEnvConfig } from "../../../shared/lib/env";

const CONSENT_KEY = "dubgrid-cookie-consent";

// Mirror the web banner's version (apps/web/src/components/CookieConsent.tsx).
// Bump in lockstep with web so a policy change re-prompts on both platforms.
export const CONSENT_VERSION = "1.2";

export type ConsentPreferences = {
  essential: true;
  analytics: boolean;
  version: string;
};

/** Last-resort host, used only when the env config can't be read at all. */
const FALLBACK_WEB_ORIGIN = "https://app.dubgrid.com";

/**
 * Public legal pages live on the web app; mobile links out to them. Derived
 * from `EXPO_PUBLIC_API_BASE_URL` rather than hardcoded, so a staging or local
 * build links to its own web app instead of production.
 */
export function getLegalUrls(): {
  privacy: string;
  terms: string;
  cookies: string;
} {
  let origin = FALLBACK_WEB_ORIGIN;
  try {
    origin = getMobileEnvConfig().apiBaseUrl.replace(/\/+$/, "");
  } catch {
    // Fall through to the production host.
  }

  return {
    privacy: `${origin}/privacy`,
    terms: `${origin}/terms`,
    cookies: `${origin}/cookie-policy`,
  };
}

/** Read the stored consent record, or null if the user hasn't chosen yet. */
export async function getStoredConsent(): Promise<ConsentPreferences | null> {
  const raw = await secureStoreAdapter.getItem(CONSENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConsentPreferences;
  } catch {
    await secureStoreAdapter.removeItem(CONSENT_KEY);
    return null;
  }
}

/** True when there is no stored choice, or it predates the current version. */
export async function needsConsentDecision(): Promise<boolean> {
  const stored = await getStoredConsent();
  return !stored || stored.version !== CONSENT_VERSION;
}

/**
 * Persist a consent choice locally and sync it to the server audit trail.
 * `analytics` is the only user-controlled flag; essential is always true.
 */
export async function setStoredConsent(analytics: boolean): Promise<ConsentPreferences> {
  const prefs: ConsentPreferences = {
    essential: true,
    analytics,
    version: CONSENT_VERSION,
  };
  await secureStoreAdapter.setItem(CONSENT_KEY, JSON.stringify(prefs));
  void syncConsentToServer(prefs);
  return prefs;
}

/**
 * Best-effort POST to the shared web audit endpoint. The route is CSRF-origin
 * protected and reads its session from cookies, so a native request records an
 * anonymous row (user_id null) tagged with the mobile user-agent. We send an
 * Origin header on the same root domain so the CSRF check passes in production.
 * Never throws — consent UX must not depend on the network.
 */
export async function syncConsentToServer(prefs: ConsentPreferences): Promise<void> {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = getMobileEnvConfig().apiBaseUrl;
  } catch {
    return;
  }

  try {
    await fetch(`${apiBaseUrl}/api/consent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: apiBaseUrl,
      },
      body: JSON.stringify({
        consent: { essential: prefs.essential, analytics: prefs.analytics },
        version: prefs.version,
      }),
    });
  } catch {
    // Best-effort — ignore network failures.
  }
}

/**
 * Request iOS App Tracking Transparency authorization, but only when the user
 * has opted into analytics and the system prompt hasn't been answered yet.
 *
 * NOTE: This is scaffolding. No analytics/tracking SDK ships in the mobile app
 * today, so nothing calls this yet. When PostHog/Sentry (or any IDFA-using SDK)
 * is added, call this immediately BEFORE initializing that SDK on iOS 14.5+.
 * Returns true when tracking is authorized (always true on Android, which has
 * no ATT prompt).
 */
export async function requestTrackingPermissionIfNeeded(): Promise<boolean> {
  if (Platform.OS !== "ios") return true;

  const consent = await getStoredConsent();
  if (!consent?.analytics) return false;

  const current = await getTrackingPermissionsAsync();
  if (current.status === "granted") return true;
  if (!current.canAskAgain) return false;

  const result = await requestTrackingPermissionsAsync();
  return result.status === "granted";
}
