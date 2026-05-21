// Client-side Sentry initialization — routed through the dev-aware shim
// so the full SDK never loads in development (prevents manifest ENOENT errors).
//
// Consent model: error monitoring is a necessary operational service and runs
// for everyone. Session Replay records user sessions, so it is gated behind
// analytics consent and only attached once the user opts in (here at boot if
// already granted, or live via the consent-changed event).
import { init, replayIntegration, addIntegration, getClient, captureRouterTransitionStart } from "@/lib/sentry";
import { getAnalyticsConsentSnapshot, subscribeToConsentChanges } from "@/components/CookieConsent";

function beforeSend(event: Record<string, unknown>) {
  const exception = event.exception as { values?: Array<{ stacktrace?: { frames?: Array<{ filename?: string }> } }> } | undefined;
  if (
    exception?.values?.[0]?.stacktrace?.frames?.some(
      (frame) => frame.filename?.includes("chrome-extension://"),
    )
  ) {
    return null;
  }
  return event;
}

const analyticsConsented = getAnalyticsConsentSnapshot();

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Replay only loads up-front when analytics consent already exists.
  // Otherwise it is attached later via addIntegration on opt-in.
  integrations: analyticsConsented ? [replayIntegration()] : [],

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
let replayAttached = analyticsConsented;
subscribeToConsentChanges(() => {
  if (replayAttached || !getAnalyticsConsentSnapshot()) return;
  if (!getClient()) return;
  addIntegration(replayIntegration());
  replayAttached = true;
});

export const onRouterTransitionStart = captureRouterTransitionStart;
