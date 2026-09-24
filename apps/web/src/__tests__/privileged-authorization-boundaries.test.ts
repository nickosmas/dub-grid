import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const webSourceRoot = path.join(repoRoot, "apps", "web", "src");

const serviceAccess =
  /from\s+["']@\/lib\/supabase-service["']|\bgetSupabaseSecretKey\b|\bSUPABASE_SERVICE_ROLE_KEY\b/;
const canonicalPrivilegedAuthorization =
  /\b(?:requireOrgPermissions|requireGridmasterSession|canManageEmployees)\s*\(/;

const INDEPENDENTLY_AUTHENTICATED_ROUTES: Record<string, string> = {
  "apps/web/src/app/api/auth/login/route.ts":
    "Password verification, CSRF, and rate limits authenticate the public credential exchange.",
  "apps/web/src/app/api/calendar/feed/[token]/route.ts":
    "The opaque feed token is the credential and every read rechecks its live user, org, membership, and employee scope.",
  "apps/web/src/app/api/consent/route.ts":
    "Public consent capture is CSRF-protected; service access only attributes a verified optional account.",
  "apps/web/src/app/api/cron/expire-requests/route.ts":
    "CRON_SECRET authenticates this system job.",
  "apps/web/src/app/api/cron/sandbox-cleanup/route.ts":
    "CRON_SECRET authenticates this system job.",
  "apps/web/src/app/api/cron/trial-expiry/route.ts": "CRON_SECRET authenticates this system job.",
  "apps/web/src/app/api/health/route.ts": "The public liveness probe returns no tenant data.",
  "apps/web/src/app/api/invitations/lookup/route.ts":
    "The live invitation token authorizes the bounded lookup.",
  "apps/web/src/app/api/invitations/register/route.ts":
    "The live invitation token, CSRF protection, and rate limits authorize registration.",
  "apps/web/src/app/api/stripe/webhook/route.ts":
    "Stripe signature verification authenticates the raw webhook payload.",
};

const AUTHENTICATED_SCOPED_ROUTES: Record<string, string> = {
  "apps/web/src/app/api/account/change-requests/[id]/route.ts":
    "The authenticated user ID owns the account request.",
  "apps/web/src/app/api/account/change-requests/route.ts":
    "The authenticated user ID owns the account requests.",
  "apps/web/src/app/api/account/mfa-status/route.ts":
    "The authenticated user ID scopes the MFA status row.",
  "apps/web/src/app/api/account/permissions/route.ts":
    "The authenticated user ID and live membership query build the returned permission context.",
  "apps/web/src/app/api/account/profile/route.ts":
    "The authenticated user ID owns the global profile and employee lookup.",
  "apps/web/src/app/api/account/sessions/route.ts":
    "The authenticated user ID owns every listed or revoked session.",
  "apps/web/src/app/api/auth/data-export/route.ts":
    "Fresh authentication and the authenticated user ID scope the export.",
  "apps/web/src/app/api/auth/delete-account/route.ts":
    "Fresh authentication and the authenticated user ID scope account deletion.",
  "apps/web/src/app/api/auth/gdpr-erase/route.ts":
    "Fresh authentication and the authenticated user ID scope erasure.",
  "apps/web/src/app/api/auth/track-session/route.ts":
    "The verified token session ID and authenticated user ID own the session record.",
  "apps/web/src/app/api/calendar/route.ts":
    "The linked-calendar helper rechecks live user, org, membership, and employee ownership.",
  "apps/web/src/app/api/organization/access-status/route.ts":
    "The recovery endpoint returns only the caller's current organization gate state.",
  "apps/web/src/app/api/organizations/role-change/route.ts":
    "The user-scoped RPC enforces live authorization; service access only records its successful result.",
  "apps/web/src/app/api/test-sandbox/route.ts":
    "Live source membership and server-side sandbox ownership authorize cloning and cleanup.",
};

const DELEGATED_SERVICE_HELPERS: Record<string, string> = {
  "apps/web/src/app/api/employees/shared.ts": "Central live employee-management authorization.",
  "apps/web/src/app/api/gridmaster/_lib/audit.ts":
    "Called only after Gridmaster route authorization.",
  "apps/web/src/app/api/shared/permissions.ts": "Central live organization authorization.",
  "apps/web/src/app/api/shared/schedule.ts":
    "Receives the authorized org and service client from routes.",
  "apps/web/src/features/account/server/calendar-subscription.ts":
    "Rechecks live user, org, membership, employee, and token ownership.",
  "apps/web/src/features/account/server/preferences.ts":
    "Scopes preferences to the authenticated user ID.",
  "apps/web/src/features/account/server/profile.ts":
    "Scopes profile operations to the authenticated user ID.",
  "apps/web/src/features/account/server/sessions.ts":
    "Scopes session operations to the authenticated user ID.",
  "apps/web/src/features/account/server/terms.ts":
    "Scopes acceptance to the authenticated user ID.",
  "apps/web/src/features/notifications/server/events.ts":
    "Receives an authenticated actor and event-owned organization identifiers.",
  "apps/web/src/features/notifications/server/sender.ts":
    "Internal notification delivery receives already-authorized recipients and events.",
  "apps/web/src/features/organization/server/invitation-delivery.ts":
    "Reads the organization name for an invitation the calling route has already authorized.",
  "apps/web/src/lib/analytics.ts":
    "Called after organization authorization with an effective org ID.",
  "apps/web/src/lib/api-auth.ts": "Owns verified request and live Gridmaster authorization.",
  "apps/web/src/lib/auth/revocation.ts":
    "Internal revocation helper writes the token cutoff first, then deletes only the verified session or user's tracked rows.",
  "apps/web/src/lib/auth/security-audit.ts":
    "Server-only best-effort writer accepts only the closed, secret-free security event contract.",
  "apps/web/src/lib/audit/authorize.ts":
    "Delegates to canonical organization or Gridmaster authorization.",
  "apps/web/src/lib/audit/invitation.ts":
    "Writes an invitation audit row for an org and actor the calling route has already authorized.",
  "apps/web/src/lib/feature-flags.ts":
    "Resolves global flags for a verified user or public default.",
  "apps/web/src/lib/org-lookup.ts":
    "Internal organization discovery used by authenticated entry flows.",
  "apps/web/src/lib/server/schedule-draft-safety.ts":
    "Receives an authorized effective org ID from schedule mutation routes.",
  "apps/web/src/lib/stripe.ts":
    "Internal billing helper called after billing authorization or a signed webhook.",
  "apps/web/src/lib/supabase-admin-users.ts":
    "Internal auth-directory helper called after employee-management authorization.",
  "apps/web/src/lib/supabase-keys.ts":
    "Server-only environment accessor for the service credential.",
  "apps/web/src/lib/supabase-service.ts": "The single server-only service-client factory.",
  "apps/web/src/proxy.ts":
    "Uses service access only for bounded navigation and organization gate checks.",
};

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    if (statSync(entryPath).isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry)) {
      files.push(entryPath);
    }
  }
  return files;
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isStepFourMobilePath(filePath: string): boolean {
  return (
    filePath.startsWith("apps/web/src/app/api/mobile/v1/") ||
    filePath.startsWith("apps/web/src/features/mobile/")
  );
}

describe("privileged service-role authorization boundaries", () => {
  const privilegedFiles = collectSourceFiles(webSourceRoot)
    .map(relativePath)
    .filter((filePath) => !isStepFourMobilePath(filePath))
    .filter((filePath) => serviceAccess.test(readFileSync(path.join(repoRoot, filePath), "utf8")));

  it("classifies every non-mobile service-role access path", () => {
    const unclassified = privilegedFiles.filter((filePath) => {
      const source = readFileSync(path.join(repoRoot, filePath), "utf8");
      if (filePath.endsWith("/route.ts")) {
        return (
          !canonicalPrivilegedAuthorization.test(source) &&
          !(filePath in INDEPENDENTLY_AUTHENTICATED_ROUTES) &&
          !(filePath in AUTHENTICATED_SCOPED_ROUTES)
        );
      }
      return !(filePath in DELEGATED_SERVICE_HELPERS);
    });

    expect(unclassified).toEqual([]);
  });

  it("keeps every exception exact and removes stale classifications", () => {
    const known = new Set(privilegedFiles);
    const routeExceptions = {
      ...INDEPENDENTLY_AUTHENTICATED_ROUTES,
      ...AUTHENTICATED_SCOPED_ROUTES,
    };
    const missing = [
      ...Object.keys(routeExceptions),
      ...Object.keys(DELEGATED_SERVICE_HELPERS),
    ].filter((filePath) => !known.has(filePath));
    const staleRouteExceptions = Object.keys(routeExceptions).filter((filePath) => {
      if (!known.has(filePath)) return false;
      return canonicalPrivilegedAuthorization.test(
        readFileSync(path.join(repoRoot, filePath), "utf8"),
      );
    });
    const unexpectedHelpers = privilegedFiles.filter(
      (filePath) => !filePath.endsWith("/route.ts") && !(filePath in DELEGATED_SERVICE_HELPERS),
    );

    expect({ missing, staleRouteExceptions, unexpectedHelpers }).toEqual({
      missing: [],
      staleRouteExceptions: [],
      unexpectedHelpers: [],
    });
  });

  it("keeps delegated tenant and Gridmaster guards live rather than claim-only", () => {
    const employeeGuard = readFileSync(
      path.join(repoRoot, "apps/web/src/app/api/employees/shared.ts"),
      "utf8",
    );
    const gridmasterGuard = readFileSync(
      path.join(repoRoot, "apps/web/src/lib/api-auth.ts"),
      "utf8",
    );

    expect(employeeGuard).toMatch(
      /from\("organization_memberships"\)[\s\S]*?\.is\("archived_at", null\)/,
    );
    expect(employeeGuard).toMatch(/from\("organizations"\)[\s\S]*?\.is\("archived_at", null\)/);
    expect(employeeGuard).toMatch(/adminPerms\?\.canManageEmployees === true/);
    expect(gridmasterGuard).toMatch(
      /requireGridmasterSession[\s\S]*?from\("profiles"\)[\s\S]*?profile\?\.platform_role !== "gridmaster"/,
    );
  });
});
