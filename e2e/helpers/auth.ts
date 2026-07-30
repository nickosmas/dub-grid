import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Seeded by seed.ts (run in CI via `npx tsx seed.ts`, see .github/workflows/e2e.yml)
// as a super_admin on the "calmhaven" org — the same org the shared Playwright
// baseURL targets. Never use a real/personal account for scripted verification.
export const QA_SUPER_ADMIN_EMAIL = "qa-super-admin@dubgrid.test";
export const QA_SUPER_ADMIN_PASSWORD = "password123";

/**
 * Logs in as the seeded QA super admin against the current page's origin
 * (the calmhaven subdomain, per playwright.config.ts's baseURL) and waits
 * for the authenticated app shell to render.
 */
export async function loginAsQaSuperAdmin(page: Page): Promise<void> {
  await page.goto("/login");

  await page.getByLabel("Email").fill(QA_SUPER_ADMIN_EMAIL);
  // Plain getByLabel("Password") is ambiguous here — it also matches the
  // adjacent "Show password" toggle button. The role-scoped variant only
  // matches the text input.
  await page.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Successful login lands on an authenticated route and renders the primary
  // nav (Header.tsx) — the most stable "we're signed in" signal available,
  // since it doesn't depend on any particular page's own content.
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });
}
