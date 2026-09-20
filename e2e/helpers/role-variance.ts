import { expect, type Page } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./auth";
import { isKnownBenignConsoleNoise, isKnownBenignResponsePath } from "./runtime-noise";

// Shared by the 25d2 role-variance specs: each role signs in once and walks
// the core routes, asserting the role-gated outcome traced in its spec's
// contract table.

/**
 * Records console errors, 403s and 5xx responses. A role hitting an endpoint
 * it may not use is a violation even when the page looks right (that is how
 * 25d2a found the invitations bug).
 *
 * `expectedFailurePaths` names request paths whose failure is an artifact of
 * the test environment rather than of the role under test: their responses
 * and the browser's "Failed to load resource" console line for them are
 * left out.
 */
export function collectUnexpectedRuntimeFailures(
  page: Page,
  options: { expectedFailurePaths?: readonly string[] } = {},
): string[] {
  const expectedFailurePaths = options.expectedFailurePaths ?? [];
  const isExpectedFailure = (url: string | undefined): boolean => {
    if (!url) return false;
    try {
      return expectedFailurePaths.includes(new URL(url).pathname);
    } catch {
      return false;
    }
  };
  const failures: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !isKnownBenignConsoleNoise(message.text()) &&
      !isExpectedFailure(message.location().url)
    ) {
      failures.push(`console:${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (
      (response.status() >= 500 || response.status() === 403) &&
      !isKnownBenignResponsePath(path) &&
      !expectedFailurePaths.includes(path)
    ) {
      failures.push(`response:${response.status()}:${path}`);
    }
  });
  return failures;
}

/**
 * On a freshly seeded database the org's trial only starts on a super admin's
 * first login, and every other member is held at /billing-required until
 * then. Start it, grab a seeded employee's profile URL while we can see the
 * manager-only links, then hand the page over to the role under test.
 */
export async function warmUpAndCaptureEmployeeHref(page: Page): Promise<string> {
  await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
  await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
  const href = await page
    .locator('a[href^="/people/"]')
    .first()
    .getAttribute("href", { timeout: 15_000 });
  expect(href, "a seeded employee profile link").toMatch(/^\/people\/[0-9a-f-]{36}$/);
  await page.context().clearCookies();
  await page.goto("about:blank");
  return href!;
}

export type RouteExpectation = {
  path: string;
  /** Where the browser must end up. */
  finalUrl: RegExp;
  /** Something only the expected outcome renders. */
  marker?: (page: Page) => ReturnType<Page["getByText"]> | ReturnType<Page["getByRole"]>;
};

export async function walkRoutes(
  page: Page,
  routes: RouteExpectation[],
  origin: string = QA_CALM_HAVEN_ORIGIN,
  /** Something that must be visible on every route, such as the impersonation banner. */
  onEveryRoute?: (page: Page) => ReturnType<Page["getByText"]>,
) {
  for (const route of routes) {
    await page.goto(`${origin}${route.path}`);
    await expect(page, route.path).toHaveURL(route.finalUrl, { timeout: 20_000 });
    // Let the client-side auth check settle before the next navigation:
    // after a server redirect (/settings -> /schedule) WebKit's ProtectedRoute
    // is still resolving the session for a moment, and a goto issued in that
    // window gets interrupted by its transient hop toward /login.
    await expect(page.getByRole("link", { name: "Schedule", exact: true }), route.path).toBeVisible(
      { timeout: 15_000 },
    );
    if (route.marker) {
      await expect(route.marker(page).first(), route.path).toBeVisible({ timeout: 15_000 });
    }
    if (onEveryRoute) {
      await expect(onEveryRoute(page).first(), `${route.path} (every route)`).toBeVisible();
    }
  }
}

export async function expectNav(
  page: Page,
  visible: string[],
  hidden: string[],
  origin: string = QA_CALM_HAVEN_ORIGIN,
) {
  await page.goto(`${origin}/schedule`);
  for (const name of visible) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 15_000 });
  }
  for (const name of hidden) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
}

/** The manager-only controls a non-admin page must never render. */
export async function expectNoManageControls(
  page: Page,
  scope: Page | ReturnType<Page["getByRole"]>,
) {
  for (const name of ["Save", "Deactivate", "Add"]) {
    await expect(scope.getByRole("button", { name, exact: true }), name).toHaveCount(0);
  }
}

/** A published, non-OFF cell in one employee's row, or in anyone else's. */
export function scheduledCell(page: Page, viewer: string, own: boolean) {
  const rowMatch = `[aria-label^="${viewer},"]`;
  return page.locator(
    `[role="gridcell"][data-empty="false"]${own ? rowMatch : `:not(${rowMatch})`}`,
  );
}
