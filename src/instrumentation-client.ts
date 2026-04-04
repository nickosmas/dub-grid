// Client-side Sentry initialization — routed through the dev-aware shim
// so the full SDK never loads in development (prevents manifest ENOENT errors).
import { init, replayIntegration, captureRouterTransitionStart } from "@/lib/sentry";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [replayIntegration()],

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enableLogs: true,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Do not send PII (emails, IPs) without explicit analytics consent
  sendDefaultPii: false,

  // Filter out browser extension errors
  beforeSend(event: Record<string, unknown>) {
    const exception = event.exception as { values?: Array<{ stacktrace?: { frames?: Array<{ filename?: string }> } }> } | undefined;
    if (
      exception?.values?.[0]?.stacktrace?.frames?.some(
        (frame) => frame.filename?.includes("chrome-extension://"),
      )
    ) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = captureRouterTransitionStart;
