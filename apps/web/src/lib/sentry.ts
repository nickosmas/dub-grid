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

// ── Platform kill switch (server-side only) ───────────────────────────────────
//
// This module is imported from both server and client code, and the flags
// table read (isFeatureEnabled) is server-only (service-role Supabase +
// Redis) — so the kill switch only gates server-side captures. It can't gate
// the top-level SDK load above without breaking the dead-code-elimination
// trick, so instead it wraps just captureException/captureMessage, the two
// calls that actually generate billable events, using a short-TTL in-memory
// cache refreshed via a dynamic import (kept out of the client bundle).

const SENTRY_FLAG_TTL_MS = 30_000;
let _sentryFlagEnabled = true;
let _sentryFlagCheckedAt = 0;

function refreshSentryFlagIfStale(): void {
  // Client AND Edge Middleware both always follow the dev/prod shim above —
  // `typeof window === "undefined"` is true in Edge Runtime too, so without
  // this it would (harmlessly, but pointlessly) pull the feature-flags ->
  // cache -> supabase-service -> logger module graph into every Edge
  // Middleware bundle and fire a Redis/Postgres read on a globally
  // distributed hot path (any JWT/org-access error) that isn't the intent
  // described above — middleware isn't where anyone would go to check
  // whether Sentry itself is misbehaving.
  if (typeof window !== "undefined" || process.env.NEXT_RUNTIME === "edge") return;
  const now = Date.now();
  if (now - _sentryFlagCheckedAt < SENTRY_FLAG_TTL_MS) return;
  _sentryFlagCheckedAt = now; // mark checked immediately so concurrent calls don't pile up requests
  void import("@/lib/feature-flags")
    .then(({ isFeatureEnabled }) => isFeatureEnabled("sentry"))
    .then((enabled) => {
      _sentryFlagEnabled = enabled;
    })
    .catch(async (err) => {
      // Fail open — keep the last known value rather than losing error visibility.
      // Still log: a persistent failure here would otherwise silently keep Sentry
      // on/off against the admin's intent with zero observability. Dynamic import,
      // same as feature-flags above, to keep this out of the client bundle.
      const { default: logger } = await import("@/lib/logger");
      logger.error({ err }, "Sentry kill-switch flag refresh failed");
    });
}

function sentryKillSwitchEnabled(): boolean {
  refreshSentryFlagIfStale();
  return _sentryFlagEnabled;
}

// ── Conditional re-exports ────────────────────────────────────────────────────

// captureException
export const captureException: (error: unknown, context?: CaptureContext) => void = _sdk
  ? (...args) => {
      if (!sentryKillSwitchEnabled()) return;
      _sdk!.captureException(...args);
    }
  : noop;

// captureMessage
export const captureMessage: (message: string, level?: SeverityLevel) => void = _sdk
  ? (...args) => {
      if (!sentryKillSwitchEnabled()) return;
      _sdk!.captureMessage(...args);
    }
  : noop;

// setUser
export const setUser: (user: SentryUser) => void = _sdk
  ? (...args) => {
      _sdk!.setUser(...args);
    }
  : noop;

// setTag
export const setTag: (key: string, value: string) => void = _sdk
  ? (...args) => {
      _sdk!.setTag(...args);
    }
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
  ? (integration) => {
      _sdk!.addIntegration(integration);
    }
  : noop;

// getClient — used to detect whether replay was already attached
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getClient: () => any = _sdk ? () => _sdk!.getClient() : () => undefined;

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
  ? (...args) => {
      _sdk!.init(...args);
    }
  : noop;

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Set Sentry user context so errors are associated with a specific user.
 * Call on auth state changes (login/logout).
 */
export function setSentryUser(
  user: { id: string; email?: string; orgId?: string; role?: string } | null,
) {
  if (user) {
    setUser({ id: user.id, email: user.email });
    if (user.orgId) setTag("org_id", user.orgId);
    if (user.role) setTag("role", user.role);
  } else {
    setUser(null);
  }
}
