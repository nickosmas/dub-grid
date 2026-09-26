import { expect, test, type Page } from "@playwright/test";
import {
  loginAsQaGridmaster,
  QA_GRIDMASTER_EMAIL,
  QA_GRIDMASTER_ORIGIN,
  QA_REGULAR_EMAIL,
} from "./helpers/auth";
import {
  collectUnexpectedRuntimeFailures,
  expectNav,
  expectNoManageControls,
  walkRoutes,
  warmUpAndCaptureEmployeeHref,
} from "./helpers/role-variance";

// 25d2c: qa-gridmaster impersonating qa-regular through the portal's own
// flow. The impersonation cookie is host-only and handleStart replaces to
// /schedule on the same host, so the impersonated session lives on the
// portal origin with the proxy overriding the org claims per request.

const IMPERSONATION_COOKIE = "dubgrid-impersonation";
const JUSTIFICATION = "25d2c role-variance qualification run";

async function impersonationCookie(page: Page) {
  const cookies = await page.context().cookies(QA_GRIDMASTER_ORIGIN);
  return cookies.find((cookie) => cookie.name === IMPERSONATION_COOKIE) ?? null;
}

/**
 * start_impersonation refuses a gridmaster who already has an open session,
 * so a run that failed mid-way (or an earlier browser project) must not
 * poison the next one. Ends every open session through the same API the
 * banner uses; the request runs with the page's cookies and a same-origin
 * Origin header for the CSRF check.
 */
async function endOpenImpersonationSessions(page: Page) {
  const history = await page.request.get(`${QA_GRIDMASTER_ORIGIN}/api/gridmaster/impersonation`, {
    params: { limit: 50 },
  });
  expect(history.ok(), "impersonation history").toBe(true);
  const { entries } = (await history.json()) as {
    entries: {
      sessionId: string;
      gridmasterEmail: string;
      endedAt: string | null;
      expiresAt: string;
    }[];
  };
  for (const entry of entries) {
    // The history is platform-wide; end_impersonation only accepts the
    // caller's own sessions, and another gridmaster's open session is not
    // this fixture's to close (start_impersonation counts per caller).
    if (entry.gridmasterEmail !== QA_GRIDMASTER_EMAIL) continue;
    if (entry.endedAt || new Date(entry.expiresAt).getTime() <= Date.now()) continue;
    const ended = await page.request.post(`${QA_GRIDMASTER_ORIGIN}/api/gridmaster/impersonation`, {
      headers: { Origin: QA_GRIDMASTER_ORIGIN },
      // end_reason is constrained to a fixed set in the database; the route
      // accepts any string and answers a violation with a 500 (see the 25d2c
      // findings), so send the value the banner sends.
      data: { action: "end", sessionId: entry.sessionId, reason: "manual" },
    });
    expect(
      ended.ok(),
      `end leftover session ${entry.sessionId}: ${ended.status()} ${await ended.text()}`,
    ).toBe(true);
  }
}

// The banner says whose view this is (F-71): the organization, the role in
// force, and the member it was borrowed from.
const BANNER_TEXT = `Viewing Calm Haven as user (${QA_REGULAR_EMAIL})`;

/** Signs in on the portal and starts impersonating qa-regular in Calm Haven. */
async function startImpersonation(page: Page) {
  await loginAsQaGridmaster(page);
  await endOpenImpersonationSessions(page);
  await page.getByRole("button", { name: "Impersonation", exact: true }).click();

  // The portal header carries its own org chip and org search; only the
  // picker inside the content region selects an impersonation target.
  const content = page.getByLabel("Gridmaster content");
  await content.getByPlaceholder("Search organizations…").fill("Calm");
  await content
    .getByRole("button", { name: /Calm Haven/ })
    .first()
    .click();

  await content.getByPlaceholder("Search by email…").fill("qa-regular");
  await content.getByRole("button", { name: QA_REGULAR_EMAIL }).first().click();

  await content.getByPlaceholder(/Why are you impersonating/).fill(JUSTIFICATION);
  await content.getByRole("button", { name: `Impersonate ${QA_REGULAR_EMAIL}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start impersonation", exact: true })
    .click();

  await expect(page).toHaveURL(`${QA_GRIDMASTER_ORIGIN}/schedule`, { timeout: 20_000 });
  await expect(page.getByText(BANNER_TEXT)).toBeVisible({ timeout: 20_000 });
}

test.describe("role variance: gridmaster impersonation", () => {
  test("starts an impersonation session from the portal", async ({ page }) => {
    test.setTimeout(180_000);
    // Calm Haven's trial must be active before a member of it is impersonated.
    await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);

    await startImpersonation(page);

    const cookie = await impersonationCookie(page);
    expect(cookie, "impersonation cookie").not.toBeNull();
    expect(JSON.parse(decodeURIComponent(cookie!.value))).toMatchObject({
      targetEmail: QA_REGULAR_EMAIL,
      targetOrgRole: "user",
      justification: JUSTIFICATION,
    });

    expect(failures).toEqual([]);
    await endOpenImpersonationSessions(page);
  });

  test("the impersonated shell is qa-regular's contract, and End Session returns to the portal", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const employeeHref = await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await startImpersonation(page);

    // Impersonation is role-scoped, not identity-scoped: the proxy verifies
    // the target's membership, organization and role, but the gridmaster's
    // own JWT keeps acting, with no linked employee. So the shell is the
    // target's permission set (UserDashboard variant, no Reports/Settings,
    // read-only People) around the gridmaster's identity, which is why the
    // dashboard shows the no-linked-profile state instead of qa-regular's
    // cards and there is no own row on the schedule.
    const banner = (p: Page) => p.getByText(BANNER_TEXT);
    await walkRoutes(
      page,
      [
        {
          path: "/dashboard",
          finalUrl: /\/dashboard$/,
          marker: (p) => p.getByText("Viewing with this member's permissions"),
        },
        { path: "/schedule", finalUrl: /\/schedule$/, marker: (p) => p.getByRole("grid") },
        {
          path: "/people",
          finalUrl: /\/people$/,
          marker: (p) => p.getByText("Directory"),
        },
        {
          // The impersonated user-role shell has no employee details
          // permission: the page bounces to the Directory, as it does for
          // qa-regular signed in directly.
          path: employeeHref,
          finalUrl: /\/people$/,
          marker: (p) => p.getByText("Directory"),
        },
        { path: "/profile", finalUrl: /\/profile/ },
        { path: "/reports", finalUrl: /\/dashboard$/ },
        { path: "/alerts", finalUrl: /\/alerts$/, marker: (p) => p.getByText("Inbox") },
        // The proxy gates by the DB-verified target role (user), so the
        // admin-tier settings redirect applies to the gridmaster's own session.
        { path: "/settings", finalUrl: /\/schedule$/ },
      ],
      QA_GRIDMASTER_ORIGIN,
      banner,
    );
    await expectNav(
      page,
      ["Dashboard", "Schedule", "People"],
      ["Reports", "Settings"],
      QA_GRIDMASTER_ORIGIN,
    );
    await expectNoManageControls(page, page);
    // Not on the schedule (no linked employee), so no work Overview section.
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/profile`);
    await expect(page).toHaveURL(/\/profile/, { timeout: 20_000 });
    await expect(banner(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveCount(0);

    // The banner ends the session directly (no confirmation; the "End
    // Impersonation" dialog belongs to the portal's Impersonation view) and
    // replaces the location with the portal. Landing on /login here was
    // F-73; the portal landing is asserted strictly now.
    const activeCookie = await impersonationCookie(page);
    const { sessionId } = JSON.parse(decodeURIComponent(activeCookie!.value)) as {
      sessionId: string;
    };
    await page.getByRole("button", { name: "End Session" }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(banner(page)).toHaveCount(0);
    expect(await impersonationCookie(page), "cookie after End Session").toBeNull();
    const history = await page.request.get(`${QA_GRIDMASTER_ORIGIN}/api/gridmaster/impersonation`, {
      params: { limit: 50 },
    });
    const ended = (
      (await history.json()) as { entries: { sessionId: string; endedAt: string | null }[] }
    ).entries.find((entry) => entry.sessionId === sessionId);
    expect(ended?.endedAt, "session ended in the database").toBeTruthy();
    await expect(page.getByRole("button", { name: "All Users" })).toBeVisible({
      timeout: 20_000,
    });

    expect(failures).toEqual([]);
    await endOpenImpersonationSessions(page);
  });

  test("navigating to /gridmaster while impersonating is the safety escape", async ({ page }) => {
    test.setTimeout(180_000);
    await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await startImpersonation(page);

    // proxy.ts clears the cookie on any /gridmaster request instead of
    // serving the portal as the impersonated user.
    const escapedCookie = await impersonationCookie(page);
    const { sessionId: escapedSessionId } = JSON.parse(
      decodeURIComponent(escapedCookie!.value),
    ) as { sessionId: string };
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster`);
    await expect(page.getByRole("button", { name: "All Users" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
    expect(await impersonationCookie(page), "cookie after the escape").toBeNull();
    // The escape ends the row too (F-72), so the next start is not refused.
    const escapeHistory = await page.request.get(
      `${QA_GRIDMASTER_ORIGIN}/api/gridmaster/impersonation`,
      { params: { limit: 50 } },
    );
    const escaped = (
      (await escapeHistory.json()) as {
        entries: { sessionId: string; endedAt: string | null; endReason: string | null }[];
      }
    ).entries.find((entry) => entry.sessionId === escapedSessionId);
    expect(escaped?.endedAt, "escape ended the session row").toBeTruthy();
    expect(escaped?.endReason).toBe("navigation");

    expect(failures).toEqual([]);
    await endOpenImpersonationSessions(page);
  });
});
