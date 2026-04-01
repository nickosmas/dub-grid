import * as Sentry from "@sentry/nextjs";

// NOTE: Client-side Sentry is primarily initialized in src/instrumentation-client.ts.
// This file is kept for compatibility with the withSentryConfig webpack plugin.
// Settings here should stay aligned with instrumentation-client.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // Do not send PII without explicit analytics consent
  sendDefaultPii: false,

  beforeSend(event) {
    if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
      (frame) => frame.filename?.includes("chrome-extension://")
    )) {
      return null;
    }
    return event;
  },
});
