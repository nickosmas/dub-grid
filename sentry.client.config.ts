import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture 100% of errors
  replaysOnErrorSampleRate: 1.0,
  // Sample 10% of sessions for replay
  replaysSessionSampleRate: 0.1,

  // Filter out known non-errors (ad blockers, extensions, etc.)
  beforeSend(event) {
    // Ignore errors from browser extensions
    if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
      (frame) => frame.filename?.includes("chrome-extension://")
    )) {
      return null;
    }
    return event;
  },
});
