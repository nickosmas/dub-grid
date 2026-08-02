import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Seeded by seed.ts (run in CI via `npx tsx seed.ts`, see .github/workflows/e2e.yml)
// as a super_admin whose preferred_org is "ardenwood" (see seed.ts's TEST_USERS
// entry, "qa-super_admin (integration tests)") — never use a real/personal
// account for scripted verification.
export const QA_SUPER_ADMIN_EMAIL = "qa-super-admin@dubgrid.test";
export const QA_SUPER_ADMIN_PASSWORD = "password123";

// Deliberately the account's own preferred_org, not playwright.config.ts's
// shared "calmhaven" baseURL: logging in on a subdomain that doesn't match
// the JWT's current org forces the slower, client-orchestrated org-switch
// path (fetchAccessibleOrganizations -> switchBrowserOrganization ->
// refreshBrowserSession, each its own Supabase round-trip) instead of the
// fast, server-resolved path api/auth/login already takes when the JWT's org
// matches the subdomain. That extra path is exactly what a first-ever login
// on a freshly seeded CI database doesn't need on top of the terms/onboarding/
// trial gates below — and any failure in it signs the user back out silently.
const PORT = process.env.PORT || 3000;
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const QA_SUPER_ADMIN_ORIGIN = `http://ardenwood.${BASE_DOMAIN}:${PORT}`;

/**
 * Clears dismissible overlays (cookie consent, an MFA nag banner, etc.) that
 * can block clicks on the nav underneath. These don't all render on the same
 * tick — the cookie dialog and MFA banner both decide whether to show inside
 * a post-mount effect — so this doesn't gate on first detecting an overlay
 * (a single-shot check can run before either has appeared); it just spends a
 * bounded window proactively trying each known dismiss control a few times.
 */
async function clearBlockingOverlays(page: Page): Promise<void> {
  const dismissControls = [
    page.getByRole("button", { name: "Essential only" }), // cookie consent banner
    page.getByRole("button", { name: "Dismiss" }), // MFA nag banner
    // The shared <Modal> primitive's close button (Modal.tsx) — covers any
    // Modal-based interstitial, e.g. TrialWelcomeModal on a first-ever login
    // for a fresh org, without needing to special-case each one by title.
    page.getByRole("button", { name: "Close modal" }),
  ];
  let consecutiveEmptyPasses = 0;
  for (let attempt = 0; attempt < 6 && consecutiveEmptyPasses < 2; attempt++) {
    let dismissedAny = false;
    for (const control of dismissControls) {
      if (await control.isVisible({ timeout: 400 }).catch(() => false)) {
        await control.click({ timeout: 2_000 }).catch(() => {});
        dismissedAny = true;
      }
    }
    consecutiveEmptyPasses = dismissedAny ? 0 : consecutiveEmptyPasses + 1;
    await page.waitForTimeout(300);
  }
}

/**
 * Logs in as the seeded QA super admin on its own home subdomain (ardenwood)
 * and waits for the authenticated app shell to render.
 */
export async function loginAsQaSuperAdmin(page: Page): Promise<void> {
  // A first-ever login for a fresh seed runs through up to four sequential
  // gates (terms, onboarding, trial modal, cookie consent), each with its
  // own multi-second wait budget — comfortably past Playwright's default
  // 30s per-test timeout on a CI runner slower than a local machine.
  test.setTimeout(60_000);

  await page.goto(`${QA_SUPER_ADMIN_ORIGIN}/login`);

  await page.getByLabel("Email").fill(QA_SUPER_ADMIN_EMAIL);
  // Plain getByLabel("Password") is ambiguous here — it also matches the
  // adjacent "Show password" toggle button. The role-scoped variant only
  // matches the text input.
  await page.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  // A never-before-logged-in account (true of any freshly seeded CI database)
  // is redirected to a one-time Terms interstitial before its real
  // destination. Accept it if it shows up; skip straight through otherwise.
  const termsHeading = page.getByRole("heading", { name: "Updated Terms of Service" });
  const dashboardLink = page.getByRole("link", { name: "Dashboard" });
  await Promise.race([
    termsHeading.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
    dashboardLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
  ]);

  if (await termsHeading.isVisible()) {
    // The Accept & Continue button stays disabled until the terms body is
    // scrolled to the bottom — jump straight there rather than simulating a
    // realistic scroll gesture, which is unnecessary and flakier in CI.
    await page.getByLabel("Terms of Service content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByRole("button", { name: "Accept & Continue" }).click();
  }

  // A super_admin's first-ever login into a given org also triggers the
  // OnboardingWizard instead of landing directly on the dashboard. Skip it
  // if shown — it's a 2-step flow (Skip setup -> confirm) and the cookie
  // consent dialog can render on top and intercept the first click, so
  // dismiss that first.
  const skipSetupButton = page.getByRole("button", { name: "Skip setup" });
  await Promise.race([
    skipSetupButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
    dashboardLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
  ]);

  if (await skipSetupButton.isVisible()) {
    await clearBlockingOverlays(page);
    await skipSetupButton.click();
    await page.getByRole("button", { name: "Yes, skip" }).click();
    // handleSkip() does a full window.location.reload() on completion.
    await page.waitForLoadState("load");
  }

  // Successful login lands on an authenticated route and renders the primary
  // nav (Header.tsx) — the most stable "we're signed in" signal available,
  // since it doesn't depend on any particular page's own content.
  await expect(dashboardLink).toBeVisible({ timeout: 15_000 });

  // Cover every path (including the fast one where neither terms nor
  // onboarding triggered) — something's usually still sitting on top of the
  // nav for whatever the calling test clicks next otherwise.
  await clearBlockingOverlays(page);
}
