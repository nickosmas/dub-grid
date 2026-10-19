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

/**
 * Forget the stored choice so the gate prompts again.
 *
 * Consent lives in device storage, which `npm run db:reset` can't reach from
 * the host machine, so a reset DB otherwise leaves a decided device behind.
 * Dev-only reset paths use this to restore the real first-run experience.
 */
export async function clearStoredConsent(): Promise<void> {
  await secureStoreAdapter.removeItem(CONSENT_KEY);
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
 * anonymous row (user_id null) tagged with the mobile user-agent. We declare
 * the exact API origin so the no-cookie request passes the same-origin check.
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
