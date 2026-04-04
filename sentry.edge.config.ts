// Edge-runtime Sentry config — loaded by src/instrumentation.ts *only* in
// production (NODE_ENV !== "development").  See that file for the guard.
//
// Do NOT import this file directly; always go through src/instrumentation.ts.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,

  tracesSampleRate: 0.1,

  // Do not send PII (emails, IPs) without explicit analytics consent
  sendDefaultPii: false,

  // Enable Sentry structured logs
  enableLogs: true,
});
