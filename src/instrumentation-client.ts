// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [Sentry.replayIntegration()],

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enableLogs: true,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Do not send PII (emails, IPs) without explicit analytics consent
  sendDefaultPii: false,

  // Filter out browser extension errors
  beforeSend(event) {
    if (
      event.exception?.values?.[0]?.stacktrace?.frames?.some(
        (frame) => frame.filename?.includes("chrome-extension://"),
      )
    ) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
