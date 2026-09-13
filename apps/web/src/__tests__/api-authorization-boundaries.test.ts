import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const apiRoot = path.join(repoRoot, "apps", "web", "src", "app", "api");

const canonicalAuthorizationCall =
  /\b(?:requireAuthenticatedSession|requireAuthenticatedUserWithClaims|requireAuthenticatedUser|requireLiveAuthenticatedSession|requireSensitiveActionAuth|requireGridmasterSession|requireOrgPermissions)\s*\(/;
const delegatedAuthorizationCall = /\b(?:authorizeAuditLogRead|createMfaLifecycleHandler)\s*\(/;

/**
 * Route Handlers that are intentionally reachable without a DubGrid user
 * session. Every entry needs its independent credential or public-purpose
 * reason here so adding a new unguarded route cannot silently expand the
 * public API surface.
 */
const PUBLIC_OR_SYSTEM_ROUTE_ALLOWLIST: Record<string, string> = {
  "apps/web/src/app/api/auth/login/route.ts":
    "Public credential exchange with CSRF and rate limits.",
  "apps/web/src/app/api/calendar/feed/[token]/route.ts":
    "The opaque calendar-feed token is the read credential.",
  "apps/web/src/app/api/consent/route.ts":
    "Public legal-consent capture with CSRF protection and optional verified account attribution.",
  "apps/web/src/app/api/cron/expire-requests/route.ts": "System job authenticated by CRON_SECRET.",
  "apps/web/src/app/api/cron/sandbox-cleanup/route.ts": "System job authenticated by CRON_SECRET.",
  "apps/web/src/app/api/cron/trial-expiry/route.ts": "System job authenticated by CRON_SECRET.",
  "apps/web/src/app/api/health/route.ts": "Public liveness probe that returns no tenant data.",
  "apps/web/src/app/api/invitations/lookup/route.ts":
    "The live invitation token is the credential and dead tokens receive a uniform response.",
  "apps/web/src/app/api/invitations/register/route.ts":
    "Invite-only registration uses the live invitation token, CSRF protection, and rate limits.",
  "apps/web/src/app/api/request-demo/route.ts":
    "Public lead form with CSRF protection and rate limits.",
  "apps/web/src/app/api/stripe/webhook/route.ts": "Stripe signs the raw webhook payload.",
  "apps/web/src/app/api/validate-domain/route.ts":
    "Public organization discovery endpoint with rate limiting and a non-sensitive response.",
};

function collectRouteHandlers(root: string): string[] {
  const routes: string[] = [];

  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    if (statSync(entryPath).isDirectory()) {
      routes.push(...collectRouteHandlers(entryPath));
    } else if (entry === "route.ts") {
      routes.push(entryPath);
    }
  }

  return routes;
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isMobileApiRoute(routePath: string): boolean {
  // Mobile receives its own complete parity inventory in feature Step 4.
  return routePath.startsWith("apps/web/src/app/api/mobile/v1/");
}

describe("web API authorization boundaries", () => {
  const routePaths = collectRouteHandlers(apiRoot)
    .map(relativePath)
    .filter((routePath) => !isMobileApiRoute(routePath));

  it("classifies every non-mobile Route Handler as guarded or an explicit public/system exception", () => {
    const unclassified = routePaths.filter((routePath) => {
      const source = readFileSync(path.join(repoRoot, routePath), "utf8");
      return (
        !canonicalAuthorizationCall.test(source) &&
        !delegatedAuthorizationCall.test(source) &&
        !(routePath in PUBLIC_OR_SYSTEM_ROUTE_ALLOWLIST)
      );
    });

    expect(unclassified).toEqual([]);
  });

  it("keeps the public/system allowlist exact and removes entries once canonical auth is added", () => {
    const knownRoutes = new Set(routePaths);
    const missing = Object.keys(PUBLIC_OR_SYSTEM_ROUTE_ALLOWLIST).filter(
      (routePath) => !knownRoutes.has(routePath),
    );
    const stale = Object.keys(PUBLIC_OR_SYSTEM_ROUTE_ALLOWLIST).filter((routePath) => {
      if (!knownRoutes.has(routePath)) return false;
      const source = readFileSync(path.join(repoRoot, routePath), "utf8");
      return canonicalAuthorizationCall.test(source) || delegatedAuthorizationCall.test(source);
    });

    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  it("keeps the audit-log delegation behind canonical live authorization", () => {
    const source = readFileSync(path.join(repoRoot, "apps/web/src/lib/audit/authorize.ts"), "utf8");

    expect(source).toMatch(/\brequireGridmasterSession\s*\(/);
    expect(source).toMatch(/\brequireOrgPermissions\s*\(/);
  });

  it("keeps MFA delegation wired to live and sensitive authentication for both transports", () => {
    const web = readFileSync(path.join(apiRoot, "account/mfa-lifecycle/route.ts"), "utf8");
    const mobile = readFileSync(
      path.join(repoRoot, "apps/web/src/features/mobile/server/routes/mfa-lifecycle.ts"),
      "utf8",
    );
    expect(web).toMatch(/liveAuth: adapt\(requireLiveAuthenticatedSession\)/);
    expect(web).toMatch(/sensitiveAuth: adapt\(requireSensitiveActionAuth\)/);
    expect(web).toMatch(/validateCsrfOrigin\(req\)/);
    expect(mobile).toMatch(/liveAuth: \(req\) => requireMobileStepUpSession\(req\)/);
    expect(mobile).toMatch(/sensitiveAuth: \(req\) => requireMobileSensitiveActionAuth\(req\)/);
    const handler = readFileSync(
      path.join(repoRoot, "apps/web/src/features/account/server/mfa-lifecycle.ts"),
      "utf8",
    );
    expect(handler).toMatch(
      /input\.action === "enroll" \|\| input\.action === "remove"[\s\S]*?options\.sensitiveAuth\(req\)/,
    );
    expect(handler.indexOf('if ("response" in auth)')).toBeLessThan(
      handler.indexOf("client.auth.mfa.enroll"),
    );
  });
});
