import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Seeded by seed.ts (run in CI via `npx tsx seed.ts`, see .github/workflows/e2e.yml)
// as a super_admin whose preferred_org is "ardenwood" (see seed.ts's TEST_USERS
// entry, "qa-super_admin (integration tests)") — never use a real/personal
// account for scripted verification.
export const QA_SUPER_ADMIN_EMAIL = "qa-super-admin@dubgrid.test";
export const QA_SUPER_ADMIN_PASSWORD = "password123";
export const QA_REGULAR_EMAIL = "qa-regular@dubgrid.test";
export const QA_MANAGEMENT_EMAIL = "qa-management@dubgrid.test";
export const QA_INACTIVE_EMAIL = "qa-inactive@dubgrid.test";
export const QA_ADMIN_EMAIL = "qa-admin@dubgrid.test";
export const QA_GRIDMASTER_EMAIL = "qa-gridmaster@dubgrid.test";
export const QA_MFA_EMAIL_BY_BROWSER = {
  chromium: "qa-mfa-chromium@dubgrid.test",
  firefox: "qa-mfa-firefox@dubgrid.test",
  webkit: "qa-mfa-webkit@dubgrid.test",
} as const;

const PORT = process.env.PORT || 3000;
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const QA_SUPER_ADMIN_ORIGIN = `http://ardenwood.${BASE_DOMAIN}:${PORT}`;
export const QA_CALM_HAVEN_ORIGIN = `http://calmhaven.${BASE_DOMAIN}:${PORT}`;
// The login route refuses a gridmaster on any organization host; the platform
// portal has its own host and sign-in form.
export const QA_GRIDMASTER_ORIGIN = `http://gridmaster.${BASE_DOMAIN}:${PORT}`;

/**
 * Clears dismissible overlays (cookie consent, an MFA nag banner, etc.) that
 * can block clicks on the nav underneath. These don't all render on the same
 * tick — the cookie dialog and MFA banner both decide whether to show inside
 * a post-mount effect — so this doesn't gate on first detecting an overlay
 * (a single-shot check can run before either has appeared); it just spends a
 * bounded window proactively trying each known dismiss control a few times.
 */
export async function clearBlockingOverlays(page: Page): Promise<void> {
  const dismissControls = [
    page.getByRole("button", { name: "Essential only" }), // cookie consent banner
    page.getByRole("button", { name: "Dismiss" }), // MFA nag banner
    // The shared <Modal> primitive's close button (Modal.tsx) — covers any
    // Modal-based interstitial, e.g. TrialWelcomeModal on a first-ever login
    // for a fresh org, without needing to special-case each one by title.
    page.getByRole("button", { name: "Close modal" }),
    // TrialWelcomeModal's own dismissal. Its sibling action is "Set up
    // billing", which navigates to the subscription settings, so a run that
    // left this modal standing could end up asserting against that page
    // instead of where the sign-in actually landed.
    page.getByRole("button", { name: "Maybe later" }),
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
 * The marker changes only after OrgLogin's mount effect runs. Waiting for it
 * keeps form interactions from landing on inert server-rendered markup in
 * WebKit.
 */
async function waitForHydratedLogin(
  page: Page,
  testId: "organization-login" | "gridmaster-login",
): Promise<Locator> {
  // A route transition can briefly leave an unhydrated server-rendered login
  // root alongside the hydrated client root. Filter before `.first()` so form
  // interactions always target the usable client form once its bundle loads.
  const loginRoot = page.locator(`[data-testid="${testId}"][data-hydrated="true"]`).first();
  await expect(loginRoot).toBeVisible({ timeout: 15_000 });
  return loginRoot;
}

export async function waitForClientHydration(page: Page): Promise<Locator> {
  return waitForHydratedLogin(page, "organization-login");
}

/** A timeout of 0 means the run has no limit, so it is never lowered. */
const LOGIN_TIMEOUT_FLOOR_MS = 60_000;

/** Logs in as a seeded QA account on an organization subdomain. */
export async function loginAsQaAccount(page: Page, email: string, origin: string): Promise<void> {
  // A first-ever login for a fresh seed runs through up to four sequential
  // gates (terms, onboarding, trial modal, cookie consent), each with its
  // own multi-second wait budget - comfortably past Playwright's default
  // 30s per-test timeout on a CI runner slower than a local machine.
  //
  // Raise the budget only when it is below that floor. `test.setTimeout`
  // replaces the value outright, so calling it unconditionally cut every
  // caller that had already asked for more back down to 60s, which is what
  // made the long route and settings-panel audits time out under load.
  const currentTimeout = test.info().timeout;
  if (currentTimeout !== 0 && currentTimeout < LOGIN_TIMEOUT_FLOOR_MS) {
    test.setTimeout(LOGIN_TIMEOUT_FLOOR_MS);
  }

  await page.goto(`${origin}/login`);
  const loginRoot = await waitForClientHydration(page);

  await loginRoot.getByLabel("Email").fill(email);
  // Plain getByLabel("Password") is ambiguous here — it also matches the
  // adjacent "Show password" toggle button. The role-scoped variant only
  // matches the text input.
  await loginRoot.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
  await loginRoot.getByRole("button", { name: "Sign In" }).click();

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
    // Exact: the confirm button reads "Skip", and the wizard's own "Skip setup"
    // button stays mounted behind the dialog, so a substring match hits both.
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    // handleSkip() does a full window.location.reload() on completion.
    await page.waitForLoadState("load");
  }

  // Successful login lands on an authenticated route and renders the primary
  // nav (Header.tsx), the most stable "we're signed in" signal available,
  // since it doesn't depend on any particular page's own content.
  //
  // The shared Modal is a Base UI dialog in modal mode, which marks everything
  // outside the popup aria-hidden while it is open. TrialWelcomeModal opens
  // right after a first login, so role queries cannot see the nav until the
  // popup is gone: wait for either the nav or that popup's close button, clear
  // whatever is on top, and only then assert on the nav.
  const closeModalButton = page.getByRole("button", { name: "Close modal" });
  await Promise.race([
    closeModalButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
    dashboardLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
  ]);
  // Also covers the fast path where neither terms nor onboarding triggered:
  // something is usually still sitting on top of the nav for whatever the
  // calling test clicks next otherwise.
  await clearBlockingOverlays(page);

  await expect(dashboardLink).toBeVisible({ timeout: 15_000 });
}

/**
 * Signs the seeded QA gridmaster into the platform portal. The portal's form
 * ("Platform admin sign in", submit "Access Portal") differs from the org
 * login, and a gridmaster has no org membership, so the signed-in signal is
 * the portal's own navigation rather than the org shell's Dashboard link.
 */
export async function loginAsQaGridmaster(page: Page): Promise<void> {
  const currentTimeout = test.info().timeout;
  if (currentTimeout !== 0 && currentTimeout < LOGIN_TIMEOUT_FLOOR_MS) {
    test.setTimeout(LOGIN_TIMEOUT_FLOOR_MS);
  }

  await page.goto(`${QA_GRIDMASTER_ORIGIN}/login`);
  const loginRoot = await waitForHydratedLogin(page, "gridmaster-login");

  await loginRoot.getByLabel("Email").fill(QA_GRIDMASTER_EMAIL);
  await loginRoot.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
  await loginRoot.getByRole("button", { name: "Access Portal" }).click();

  // Same one-time Terms interstitial as org accounts on a fresh seed.
  const termsHeading = page.getByRole("heading", { name: "Updated Terms of Service" });
  // GridmasterPortal's nav items are SidebarMenuButtons (view switches), not links.
  const portalNavLink = page.getByRole("button", { name: "All Users" });
  await Promise.race([
    termsHeading.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
    portalNavLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
  ]);

  if (await termsHeading.isVisible()) {
    await page.getByLabel("Terms of Service content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByRole("button", { name: "Accept & Continue" }).click();
  }

  await clearBlockingOverlays(page);
  await expect(portalNavLink).toBeVisible({ timeout: 15_000 });
}

/** Logs in as the original seeded QA super admin used by existing specs. */
export async function loginAsQaSuperAdmin(
  page: Page,
  origin = QA_SUPER_ADMIN_ORIGIN,
): Promise<void> {
  await loginAsQaAccount(page, QA_SUPER_ADMIN_EMAIL, origin);
}
