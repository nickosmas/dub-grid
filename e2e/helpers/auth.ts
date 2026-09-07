import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Seeded by seed.ts (run in CI via `npx tsx seed.ts`, see .github/workflows/e2e.yml)
// as a super_admin whose preferred_org is "ardenwood" (see seed.ts's TEST_USERS
// entry, "qa-super_admin (integration tests)") — never use a real/personal
// account for scripted verification.
export const QA_SUPER_ADMIN_EMAIL = "qa-super-admin@dubgrid.test";
export const QA_SUPER_ADMIN_PASSWORD = "password123";

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
 * The marker changes only after OrgLogin's mount effect runs. Waiting for it
 * keeps form interactions from landing on inert server-rendered markup in
 * WebKit.
 */
export async function waitForClientHydration(page: Page): Promise<void> {
  await expect(page.getByTestId("organization-login")).toHaveAttribute("data-hydrated", "true", {
    timeout: 15_000,
  });
}

/** A timeout of 0 means the run has no limit, so it is never lowered. */
const LOGIN_TIMEOUT_FLOOR_MS = 60_000;

/** Logs in as the seeded QA super admin on its organization subdomain. */
export async function loginAsQaSuperAdmin(page: Page): Promise<void> {
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

  await page.goto(`${QA_SUPER_ADMIN_ORIGIN}/login`);
  await waitForClientHydration(page);

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
