// Client-side Sentry initialization — routed through the dev-aware shim
// so the full SDK never loads in development (prevents manifest ENOENT errors).
//
// Consent model: error monitoring is a necessary operational service and runs
// for everyone. Session Replay records user sessions, so it is gated behind
// analytics consent and only attached once the user opts in (here at boot if
// already granted, or live via the consent-changed event).
import {
  init,
  addIntegration,
  getClient,
  captureRouterTransitionStart,
  loadReplayIntegration,
} from "@/lib/sentry";
import { getAnalyticsConsentSnapshot, subscribeToConsentChanges } from "@/components/CookieConsent";
import { clientEnv } from "@/lib/env";

function beforeSend(event: Record<string, unknown>) {
  const exception = event.exception as
    { values?: Array<{ stacktrace?: { frames?: Array<{ filename?: string }> } }> } | undefined;
  if (
    exception?.values?.[0]?.stacktrace?.frames?.some((frame) =>
      frame.filename?.includes("chrome-extension://"),
    )
  ) {
    return null;
  }
  return event;
}

const analyticsConsented = getAnalyticsConsentSnapshot();

/**
 * Loads Session Replay on demand and attaches it.
 *
 * Replay is the heaviest part of the browser SDK by a wide margin, and it is
 * useless without analytics consent — so it is imported here rather than at
 * module scope. Statically imported it shipped to every visitor of every page,
 * consent or not: the gate stopped it *recording*, never downloading, which is
 * the same mistake the PostHog provider used to make.
 */
async function attachSessionReplay(): Promise<void> {
  // loadReplayIntegration waits for the core SDK, which now loads
  // asynchronously as well — getClient() is undefined for the first moments of
  // the page, so checking it before that resolves would silently deny replay to
  // a consenting visitor.
  const replay = await loadReplayIntegration();
  if (!replay || !getClient()) return;
  addIntegration(replay);
}

init({
  dsn: clientEnv?.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!clientEnv?.NEXT_PUBLIC_SENTRY_DSN,

  // Never at boot. Error monitoring is what has to be up immediately; replay
  // is attached afterwards, and only for a consenting visitor.
  integrations: [],

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enableLogs: true,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Do not send PII (emails, IPs) without explicit analytics consent
  sendDefaultPii: false,

  // Filter out browser extension errors
  beforeSend,
});

// Attach Session Replay the moment the user grants analytics consent, without
// requiring a page reload. Guard against double-attach.
let replayAttached = false;

function attachReplayOnce(): void {
  if (replayAttached) return;
  replayAttached = true;
  void attachSessionReplay().catch(() => {
    // A failed replay download must never take error monitoring with it.
    replayAttached = false;
  });
}

// Already consented on this load: attach after boot rather than during it, so
// the download never sits in front of first paint.
if (analyticsConsented) attachReplayOnce();

subscribeToConsentChanges(() => {
  if (!getAnalyticsConsentSnapshot()) return;
  attachReplayOnce();
});

export const onRouterTransitionStart = captureRouterTransitionStart;
