import { expect, test, type Page } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

const BOOTSTRAP_PATH = "/api/organization/bootstrap";

test.describe("degraded-network authentication recovery", () => {
  test("Calm Haven cold login completes after a delayed bootstrap", async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const origin = requireCalmHavenOrigin(baseURL);
    let bootstrapRequests = 0;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
      bootstrapRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });

    await loginAsQaSuperAdmin(page, origin);

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login/);
    expect(bootstrapRequests).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });

  test("Calm Haven cold bootstrap recovers in place after exhausted 503 responses", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    const origin = requireCalmHavenOrigin(baseURL);
    await loginAsQaSuperAdmin(page, origin);
    // Finish the successful login lifecycle before intercepting the cold-load
    // request. Otherwise an already-started dashboard bootstrap can overlap
    // the reload below and make the test measure setup traffic as recovery.
    await page.waitForLoadState("networkidle");

    let failBootstrap = true;
    const bootstrapStatuses: number[] = [];
    let activeBootstrapIntercepts = 0;
    let maximumConcurrentBootstrapIntercepts = 0;
    const pageErrors: string[] = [];
    const criticalRequestFailures: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      if (new URL(request.url()).pathname === BOOTSTRAP_PATH) {
        criticalRequestFailures.push(request.failure()?.errorText ?? "request failed");
      }
    });
    await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
      activeBootstrapIntercepts += 1;
      maximumConcurrentBootstrapIntercepts = Math.max(
        maximumConcurrentBootstrapIntercepts,
        activeBootstrapIntercepts,
      );
      try {
        if (failBootstrap) {
          bootstrapStatuses.push(503);
          await new Promise((resolve) => setTimeout(resolve, 50));
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            headers: { "retry-after": "0" },
            body: JSON.stringify({ error: "Temporary test failure" }),
          });
          return;
        }

        const response = await route.fetch();
        bootstrapStatuses.push(response.status());
        await route.fulfill({ response });
      } finally {
        activeBootstrapIntercepts -= 1;
      }
    });

    const routeBeforeRecovery = new URL(page.url()).pathname;
    await page.reload();

    await expect(page.getByRole("heading", { name: "Loading your workspace" })).toBeVisible({
      timeout: 30_000,
    });
    // Up to eight automatic attempts may run first (asserted below), each a
    // round trip on a loaded runner, so this waits longer than the default.
    await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled({
      timeout: 20_000,
    });
    const automaticAttemptCount = bootstrapStatuses.filter((status) => status === 503).length;
    expect(automaticAttemptCount).toBeGreaterThan(0);
    expect(automaticAttemptCount).toBeLessThanOrEqual(8);
    await page.waitForTimeout(2_000);
    const unexpectedRequestFailures = criticalRequestFailures.filter(
      (failure) => failure !== "net::ERR_ABORTED",
    );
    const callerAbortCount = criticalRequestFailures.filter(
      (failure) => failure === "net::ERR_ABORTED",
    ).length;
    expect(unexpectedRequestFailures).toEqual([]);
    expect(maximumConcurrentBootstrapIntercepts).toBeLessThanOrEqual(callerAbortCount + 1);
    if (maximumConcurrentBootstrapIntercepts > 1) {
      expect(callerAbortCount).toBeGreaterThan(0);
    }
    expect(bootstrapStatuses.filter((status) => status === 503)).toHaveLength(
      automaticAttemptCount,
    );

    failBootstrap = false;
    await page.getByRole("button", { name: "Try again" }).click();

    await expect.poll(() => bootstrapStatuses.at(-1), { timeout: 30_000 }).toBe(200);
    await expect(page.getByRole("heading", { name: "Loading your workspace" })).toBeHidden({
      timeout: 30_000,
    });
    expect(new URL(page.url()).pathname).toBe(routeBeforeRecovery);
    expect(pageErrors).toEqual([]);
    expect(unexpectedRequestFailures).toEqual([]);

    await testInfo.attach("auth-bootstrap-recovery.json", {
      body: JSON.stringify(
        {
          scenario: "503_then_manual_recovery",
          automaticAttemptCount,
          maximumConcurrentBootstrapIntercepts,
          callerAbortCount,
          bootstrapStatuses,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
});

function requireCalmHavenOrigin(baseURL: string | undefined): string {
  expect(baseURL, "Playwright baseURL is required").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname.startsWith("calmhaven.")).toBe(true);
  return origin;
}
