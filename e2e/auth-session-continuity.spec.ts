import { expect, test, type Page } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";
import { isKnownBenignConsoleNoise, isKnownBenignResponsePath } from "./helpers/runtime-noise";

interface RuntimeFailures {
  unexpected: string[];
  authBoundaryRejections: string[];
}

/**
 * Reads the dashboard mount fires that can still be in flight when the other
 * tab signs out. A 401 on one of these is the boundary working, not a defect.
 */
const SESSION_SCOPED_DASHBOARD_READS = new Set([
  "/api/organization/bootstrap",
  "/api/trial-welcome",
  "/api/account/identity",
]);

function collectRuntimeFailures(page: Page): RuntimeFailures {
  const failures: RuntimeFailures = { unexpected: [], authBoundaryRejections: [] };

  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/Failed to load resource: the server responded with a status of (?:401|403)/.test(
        message.text(),
      ) &&
      !/WebSocket connection to 'ws:\/\/127\.0\.0\.1:54321\/realtime\/v1\//.test(message.text()) &&
      !isKnownBenignConsoleNoise(message.text())
    ) {
      failures.unexpected.push(`console:${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (isKnownBenignResponsePath(path)) {
      // Vercel's telemetry endpoint is not part of DubGrid's auth boundary
      // and only resolves inside a real Vercel runtime.
      return;
    }
    if (response.status() === 401 && SESSION_SCOPED_DASHBOARD_READS.has(path)) {
      // A request already accepted by the browser can reach the server after
      // the sibling tab revokes the shared session. The boundary still aborts
      // the client work and redirects before that response can render data.
      // Every path here fires from the same dashboard mount, so they race the
      // revocation the same way; account/identity was missing and turned an
      // ordinary race into a failed run about one in several.
      failures.authBoundaryRejections.push(path);
    } else if (response.status() >= 400) {
      failures.unexpected.push(`response:${response.status()}:${path}`);
    }
  });

  return failures;
}

test("a Calm Haven sign-out propagates to another authenticated tab", async ({
  context,
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const origin = new URL(baseURL ?? "http://calmhaven.localhost:3000").origin;
  expect(new URL(origin).hostname.startsWith("calmhaven.")).toBe(true);

  await loginAsQaSuperAdmin(page, origin);
  const firstTabFailures = collectRuntimeFailures(page);

  const secondPage = await context.newPage();
  const secondTabFailures = collectRuntimeFailures(secondPage);
  await secondPage.goto(`${origin}/dashboard`);
  await expect(secondPage.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await secondPage.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Sign out" });
  await confirmation.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(page).toHaveURL(/\/goodbye/);
  await expect(secondPage).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(secondPage.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(secondPage.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

  expect(firstTabFailures.unexpected).toEqual([]);
  expect(secondTabFailures.unexpected).toEqual([]);
  expect(
    secondTabFailures.authBoundaryRejections.every((path) =>
      SESSION_SCOPED_DASHBOARD_READS.has(path),
    ),
  ).toBe(true);
});
