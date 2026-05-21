/**
 * Dev-aware Sentry shim.
 *
 * In production  → all calls forwarded to the real @sentry/nextjs SDK.
 * In development → all calls are no-ops so the SDK never loads and never
 *                  triggers the pages-manifest / prerender-manifest / routes-manifest
 *                  scans that cause ENOENT 500s in the Turbopack dev server.
 *
 * All files in the codebase should import from "@/lib/sentry" instead of
 * "@sentry/nextjs" directly so this shim is the single gating point.
 *
 * The SDK is loaded via a top-level `if (process.env.NODE_ENV !== "development")`
 * block. Turbopack inlines NODE_ENV at compile time and dead-code-eliminates
 * the entire block in dev, so `require("@sentry/nextjs")` is never resolved
 * or bundled during development — preventing the ENOENT manifest scans.
 */

// ── Type stubs so TypeScript is happy when the real SDK isn't loaded ──────────

type SeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";
type SentryUser = { id?: string; email?: string; [key: string]: unknown } | null;
type CaptureContext = { extra?: Record<string, unknown>; [key: string]: unknown };

// ── No-op implementations ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (...args: unknown[]) => {};

const devLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  trace: noop,
  log: noop,
};

// ── Load the real SDK in production only ─────────────────────────────────────
//
// This top-level `if` block is dead-code-eliminated by Turbopack/webpack in dev
// because process.env.NODE_ENV is inlined as "development" at compile time,
// making the condition `"development" !== "development"` → `false`.
// The `require("@sentry/nextjs")` inside is therefore never seen by the
// bundler's module resolver during dev builds.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: Record<string, any> | undefined;

if (process.env.NODE_ENV !== "development") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _sdk = require("@sentry/nextjs");
}

// ── Conditional re-exports ────────────────────────────────────────────────────

// captureException
export const captureException: (error: unknown, context?: CaptureContext) => void = _sdk
  ? (...args) => { _sdk!.captureException(...args); }
  : noop;

// captureMessage
export const captureMessage: (message: string, level?: SeverityLevel) => void = _sdk
  ? (...args) => { _sdk!.captureMessage(...args); }
  : noop;

// setUser
export const setUser: (user: SentryUser) => void = _sdk
  ? (...args) => { _sdk!.setUser(...args); }
  : noop;

// setTag
export const setTag: (key: string, value: string) => void = _sdk
  ? (...args) => { _sdk!.setTag(...args); }
  : noop;

// logger (structured logging via Sentry)
export const logger: typeof devLogger = _sdk?.logger ?? devLogger;

// replayIntegration — used by instrumentation-client.ts (client-side only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const replayIntegration: (...args: any[]) => any = _sdk
  ? (...args) => _sdk!.replayIntegration(...args)
  : () => ({});

// addIntegration — lets us attach replay lazily once analytics consent is granted
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const addIntegration: (integration: any) => void = _sdk
  ? (integration) => { _sdk!.addIntegration(integration); }
  : noop;

// getClient — used to detect whether replay was already attached
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getClient: () => any = _sdk
  ? () => _sdk!.getClient()
  : () => undefined;

// captureRouterTransitionStart — exported from instrumentation-client.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const captureRouterTransitionStart: (...args: any[]) => any = _sdk
  ? (...args) => _sdk!.captureRouterTransitionStart(...args)
  : <T>(v: T) => v;

// captureRequestError — exported from instrumentation.ts on the server
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const captureRequestError: (...args: any[]) => any = _sdk
  ? (...args) => _sdk!.captureRequestError(...args)
  : noop;

// init — used in sentry.server/edge/client config files
export const init: (options: Record<string, unknown>) => void = _sdk
  ? (...args) => { _sdk!.init(...args); }
  : noop;

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Set Sentry user context so errors are associated with a specific user.
 * Call on auth state changes (login/logout).
 */
export function setSentryUser(user: { id: string; email?: string; orgId?: string; role?: string } | null) {
  if (user) {
    setUser({ id: user.id, email: user.email });
    if (user.orgId) setTag("org_id", user.orgId);
    if (user.role) setTag("role", user.role);
  } else {
    setUser(null);
  }
}
