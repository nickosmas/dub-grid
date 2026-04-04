import { captureRequestError } from "@/lib/sentry";

export async function register() {
  // Skip Sentry initialisation in dev — the SDK's server-side auto-
  // instrumentation scans pages-manifest.json which doesn't exist in the
  // App Router dev server, causing ENOENT 500s on every page load.
  // withSentryConfig is also skipped in next.config.ts for the same reason.
  if (process.env.NODE_ENV === "development") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// The shim returns a no-op in dev and the real captureRequestError in prod.
export const onRequestError = captureRequestError;
