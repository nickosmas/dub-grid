import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_ACTION_DESTINATIONS } from "@/lib/auth/integrity-contract";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const webSourceRoot = path.join(repoRoot, "apps", "web", "src");
const mobileSourceRoot = path.join(repoRoot, "apps", "mobile", "src");
const apiRoot = path.join(webSourceRoot, "app", "api");

const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"] as const;

const BROWSER_MUTATION_ROUTES = [
  "apps/web/src/app/api/account/calendar-subscription/route.ts",
  "apps/web/src/app/api/account/change-requests/[id]/route.ts",
  "apps/web/src/app/api/account/change-requests/route.ts",
  "apps/web/src/app/api/account/credential-assurance/route.ts",
  "apps/web/src/app/api/account/logout-cleanup/route.ts",
  "apps/web/src/app/api/account/mfa-lifecycle/route.ts",
  "apps/web/src/app/api/account/mfa-status/route.ts",
  "apps/web/src/app/api/account/notification-preferences/route.ts",
  "apps/web/src/app/api/account/profile/phone/route.ts",
  "apps/web/src/app/api/account/profile/route.ts",
  "apps/web/src/app/api/account/sessions/route.ts",
  "apps/web/src/app/api/account/terms/route.ts",
  "apps/web/src/app/api/auth/delete-account/route.ts",
  "apps/web/src/app/api/auth/gdpr-erase/route.ts",
  "apps/web/src/app/api/auth/login/complete/route.ts",
  "apps/web/src/app/api/auth/login/route.ts",
  "apps/web/src/app/api/auth/organizations/route.ts",
  "apps/web/src/app/api/auth/recovery-request/route.ts",
  "apps/web/src/app/api/auth/sign-out/route.ts",
  "apps/web/src/app/api/auth/start-trial/route.ts",
  "apps/web/src/app/api/auth/track-session/route.ts",
  "apps/web/src/app/api/consent/route.ts",
  "apps/web/src/app/api/employees/check-email/route.ts",
  "apps/web/src/app/api/employees/check-phone/route.ts",
  "apps/web/src/app/api/employees/identity/route.ts",
  "apps/web/src/app/api/employees/manage/route.ts",
  "apps/web/src/app/api/employees/status/route.ts",
  "apps/web/src/app/api/gridmaster/accounts/route.ts",
  "apps/web/src/app/api/gridmaster/audit-log/export/route.ts",
  "apps/web/src/app/api/gridmaster/impersonation/route.ts",
  "apps/web/src/app/api/gridmaster/organizations/manage/route.ts",
  "apps/web/src/app/api/gridmaster/password-reset/route.ts",
  "apps/web/src/app/api/gridmaster/platform-flags/route.ts",
  "apps/web/src/app/api/gridmaster/stripe-sync/route.ts",
  "apps/web/src/app/api/gridmaster/subscription/route.ts",
  "apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts",
  "apps/web/src/app/api/gridmaster/users/[userId]/reinstate/route.ts",
  "apps/web/src/app/api/gridmaster/users/[userId]/terminate/route.ts",
  "apps/web/src/app/api/gridmaster/users/route.ts",
  "apps/web/src/app/api/import/employees/route.ts",
  "apps/web/src/app/api/invitations/accept/route.ts",
  "apps/web/src/app/api/invitations/register/route.ts",
  "apps/web/src/app/api/notifications/bulk/route.ts",
  "apps/web/src/app/api/notifications/route.ts",
  "apps/web/src/app/api/notifications/search/route.ts",
  "apps/web/src/app/api/notify-impersonation/route.ts",
  "apps/web/src/app/api/onboarding/route.ts",
  "apps/web/src/app/api/organizations/access/route.ts",
  "apps/web/src/app/api/organizations/app-only-user/route.ts",
  "apps/web/src/app/api/organizations/delete/route.ts",
  "apps/web/src/app/api/organizations/invitations/create/route.ts",
  "apps/web/src/app/api/organizations/invitations/route.ts",
  "apps/web/src/app/api/organizations/role-change/route.ts",
  "apps/web/src/app/api/organizations/settings/route.ts",
  "apps/web/src/app/api/people/change-requests/[id]/route.ts",
  "apps/web/src/app/api/request-demo/route.ts",
  "apps/web/src/app/api/schedule/actor-names/route.ts",
  "apps/web/src/app/api/schedule/editor-sessions/route.ts",
  "apps/web/src/app/api/schedule/manage/route.ts",
  "apps/web/src/app/api/schedule/recurring/route.ts",
  "apps/web/src/app/api/schedule/requests/route.ts",
  "apps/web/src/app/api/send-notification/route.ts",
  "apps/web/src/app/api/settings/config/route.ts",
  "apps/web/src/app/api/shifts/discard/route.ts",
  "apps/web/src/app/api/shifts/publish/route.ts",
  "apps/web/src/app/api/shifts/repeat-overwrites/route.ts",
  "apps/web/src/app/api/stripe/billing-portal/route.ts",
  "apps/web/src/app/api/stripe/checkout-complete/route.ts",
  "apps/web/src/app/api/stripe/create-checkout/route.ts",
  "apps/web/src/app/api/test-sandbox/route.ts",
  "apps/web/src/app/api/trial-welcome/route.ts",
  "apps/web/src/app/api/users/check-email/route.ts",
] as const;

const REDIRECT_CONSUMERS: Record<string, string> = {
  "apps/web/src/app/(app)/accept-terms/page.tsx":
    "Carries an internal post-login destination through required terms acceptance.",
  "apps/web/src/app/(app)/auth/callback/route.ts":
    "Selects the internal destination after a PKCE code exchange.",
  "apps/web/src/app/(app)/auth/confirm/route.ts":
    "Selects the internal destination after server-side email action verification.",
  "apps/web/src/app/(app)/auth/verify/page.tsx":
    "Selects the internal destination after the scanner-safe Continue action.",
  "apps/web/src/app/(app)/forgot-password/page.tsx":
    "Constructs the fixed same-origin recovery callback passed to Supabase.",
  "apps/web/src/app/(app)/login/shared.tsx":
    "Constructs the fixed dashboard destination after login and terms acceptance.",
  "apps/web/src/app/api/auth/login/route.ts":
    "Returns the fixed dashboard or terms destination after credential exchange.",
  "apps/web/src/features/account/client/auth.ts":
    "Forwards the application-owned recovery callback to Supabase Auth.",
  "apps/web/src/hooks/useLogout.ts":
    "Accepts an application-owned post-logout destination before hard navigation.",
};

const OTP_CONSUMERS: Record<string, string> = {
  "apps/mobile/src/features/auth/screens/ResetPasswordScreen.tsx":
    "Verifies a recovery OTP with an ephemeral native client.",
  "apps/web/src/app/(app)/auth/verify/page.tsx":
    "Consumes an email action only after the user chooses Continue.",
  "apps/web/src/features/account/client/auth.ts":
    "Provides the single browser wrapper around Supabase verifyOtp.",
};

const PUBLIC_BROWSER_MUTATIONS: Record<string, string> = {
  "apps/web/src/app/api/auth/login/route.ts":
    "Public credential exchange protected by the browser origin policy and rate limits.",
  "apps/web/src/app/api/consent/route.ts":
    "Public consent capture protected by the browser origin policy.",
  "apps/web/src/app/api/invitations/register/route.ts":
    "Invitation-token registration protected by the browser origin policy and rate limits.",
  "apps/web/src/app/api/request-demo/route.ts":
    "Public lead form protected by the browser origin policy and rate limits.",
};

const SIGNED_MUTATION_EXEMPTIONS: Record<string, string> = {
  "apps/web/src/app/api/stripe/webhook/route.ts":
    "Stripe authenticates the raw request body with its signature header.",
};

const SYSTEM_JOB_ROUTES: Record<string, string> = {
  "apps/web/src/app/api/cron/expire-requests/route.ts":
    "Vercel cron authenticates with CRON_SECRET.",
  "apps/web/src/app/api/cron/sandbox-cleanup/route.ts":
    "Vercel cron authenticates with CRON_SECRET.",
  "apps/web/src/app/api/cron/trial-expiry/route.ts": "Vercel cron authenticates with CRON_SECRET.",
};

const READ_ONLY_PUBLIC_ROUTES: Record<string, string> = {
  "apps/web/src/app/api/calendar/feed/[token]/route.ts":
    "The opaque calendar token is a read-only feed credential.",
  "apps/web/src/app/api/health/route.ts": "Public read-only liveness probe.",
  "apps/web/src/app/api/invitations/lookup/route.ts":
    "The opaque invitation token permits only a bounded live-invitation lookup.",
  "apps/web/src/app/api/validate-domain/route.ts":
    "Rate-limited organization discovery returns bounded public metadata.",
};

function collectFiles(root: string, predicate: (name: string) => boolean): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    if (statSync(entryPath).isDirectory()) {
      files.push(...collectFiles(entryPath, predicate));
    } else if (predicate(entry)) {
      files.push(entryPath);
    }
  }

  return files;
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function source(relativeFilePath: string): string {
  return readFileSync(path.join(repoRoot, relativeFilePath), "utf8");
}

function sourceFiles(root: string): string[] {
  return collectFiles(
    root,
    (name) =>
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx"),
  ).map(relativePath);
}

function exportedMutationMethods(routeSource: string): string[] {
  const methods = new Set<string>();
  const declarations = routeSource.matchAll(
    /export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/g,
  );
  for (const match of declarations) methods.add(match[1]);

  const reExports = routeSource.matchAll(/export\s*\{([^}]+)\}\s*from/g);
  for (const [, exportsList] of reExports) {
    for (const method of mutationMethods) {
      if (new RegExp(`(?:\\bas\\s+|\\b)${method}\\b`).test(exportsList)) methods.add(method);
    }
  }

  return [...methods].sort();
}

function discoveredRedirectConsumers(): string[] {
  const markers = [
    /searchParams\.get\(["']next["']\)/,
    /redirectTo\?:\s*string/,
    /resetBrowserPasswordForEmail\([^)]*redirectTo/,
    /window\.location\.origin\}\/reset-password/,
    /accept-terms\?next=/,
  ];

  return sourceFiles(webSourceRoot)
    .filter((filePath) => markers.some((marker) => marker.test(source(filePath))))
    .sort();
}

function discoveredOtpConsumers(): string[] {
  return [...sourceFiles(webSourceRoot), ...sourceFiles(mobileSourceRoot)]
    .filter((filePath) => /\b(?:verifyOtp|verifyBrowserOtp)\s*\(/.test(source(filePath)))
    .sort();
}

describe("authentication integrity entry-point inventory", () => {
  it("allows only the recovery email action and binds it to a fixed destination", () => {
    expect(AUTH_ACTION_DESTINATIONS).toEqual({ recovery: "/reset-password" });
    expect(Object.values(AUTH_ACTION_DESTINATIONS).every((value) => value.startsWith("/"))).toBe(
      true,
    );
  });

  it("classifies every redirect and OTP consumer with one reason", () => {
    expect(discoveredRedirectConsumers()).toEqual(Object.keys(REDIRECT_CONSUMERS).sort());
    expect(discoveredOtpConsumers()).toEqual(Object.keys(OTP_CONSUMERS).sort());
    expect(Object.values({ ...REDIRECT_CONSUMERS, ...OTP_CONSUMERS }).every(Boolean)).toBe(true);
  });

  it("classifies every mutating API route by browser, native, or signed boundary", () => {
    const routes = collectFiles(apiRoot, (name) => name === "route.ts")
      .map(relativePath)
      .map((routePath) => ({ routePath, routeSource: source(routePath) }))
      .filter(({ routeSource }) => exportedMutationMethods(routeSource).length > 0);

    const unclassified = routes
      .filter(({ routePath, routeSource }) => {
        if (routePath.startsWith("apps/web/src/app/api/mobile/v1/")) {
          return !/export\s*\{[^}]+\}\s*from\s*["']@\/features\/mobile\/server\/routes\//.test(
            routeSource,
          );
        }
        if (routePath in SIGNED_MUTATION_EXEMPTIONS) return false;
        if (routeSource.includes("validateCsrfOrigin(")) return false;
        return true;
      })
      .map(({ routePath }) => routePath);

    const browserRoutes = routes
      .filter(
        ({ routePath }) =>
          !routePath.startsWith("apps/web/src/app/api/mobile/v1/") &&
          !(routePath in SIGNED_MUTATION_EXEMPTIONS),
      )
      .map(({ routePath }) => routePath)
      .sort();

    const currentBrowserGaps = routes
      .filter(
        ({ routePath, routeSource }) =>
          !routePath.startsWith("apps/web/src/app/api/mobile/v1/") &&
          !(routePath in SIGNED_MUTATION_EXEMPTIONS) &&
          !routeSource.includes("validateCsrfOrigin("),
      )
      .map(({ routePath }) => routePath)
      .sort();

    expect(unclassified).toEqual([]);
    expect(browserRoutes).toEqual([...BROWSER_MUTATION_ROUTES].sort());
    expect(currentBrowserGaps).toEqual([]);
  });

  it("keeps public browser mutations behind CSRF and non-browser exceptions exact", () => {
    for (const routePath of Object.keys(PUBLIC_BROWSER_MUTATIONS)) {
      expect(source(routePath), routePath).toMatch(/validateCsrfOrigin\s*\(/);
    }

    for (const routePath of Object.keys(SIGNED_MUTATION_EXEMPTIONS)) {
      expect(source(routePath), routePath).toMatch(/stripe\.webhooks\.constructEvent\s*\(/);
    }

    const cronRoutes = collectFiles(path.join(apiRoot, "cron"), (name) => name === "route.ts")
      .map(relativePath)
      .sort();
    expect(cronRoutes).toEqual(Object.keys(SYSTEM_JOB_ROUTES).sort());
    for (const routePath of cronRoutes) {
      expect(source(routePath), routePath).toMatch(/CRON_SECRET/);
    }

    for (const routePath of Object.keys(READ_ONLY_PUBLIC_ROUTES)) {
      const routeSource = source(routePath);
      expect(exportedMutationMethods(routeSource), routePath).toEqual([]);
      expect(routeSource, routePath).toMatch(/export\s+(?:async\s+function|const)\s+GET\b/);
    }
  });
});
