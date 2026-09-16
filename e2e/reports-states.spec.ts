import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

// fetchOperationsReport (features/reports/client/api.ts) appends query params.
const OPERATIONS_GLOB = "/api/reports/operations*";

test.describe("reports states", () => {
  test("opens and closes the date-range and target popovers", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/reports`);
    await page.waitForLoadState("networkidle");

    // ReportRangePicker only renders once the Range select is on "Custom"
    // (ReportsPageContent.tsx: `quickRange === "custom"`). CustomSelect is a
    // button with aria-haspopup="listbox" whose options carry role="option".
    const rangeSelect = page.getByRole("button", { name: "Range", exact: true });
    await expect(rangeSelect).toBeVisible({ timeout: 15_000 });
    await rangeSelect.click();
    await page.getByRole("option", { name: "Custom", exact: true }).click();

    // Its popover opens on the calendar's first prompt.
    const rangeTrigger = page.getByRole("button", { name: "Date range", exact: true });
    await expect(rangeTrigger).toBeVisible({ timeout: 15_000 });
    await rangeTrigger.click();
    await expect(page.getByText("Select start date")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Select start date")).toBeHidden();

    // TargetDropdown: its popover carries the title and a Clear action.
    const targetTrigger = page.getByRole("button", { name: "Focus areas", exact: true });
    await targetTrigger.click();
    const clearButton = page.getByRole("button", { name: "Clear", exact: true });
    await expect(clearButton).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(clearButton).toBeHidden();
  });

  test("shows the top progress bar while a generated report is in flight", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/reports`);
    await page.waitForLoadState("networkidle");

    // The same endpoint also feeds the target dropdown options; delaying
    // every call is fine here because only the generated report's query
    // drives the progress bar (ReportsPageContent.tsx: reportsQuery.isFetching).
    await page.route(`**${OPERATIONS_GLOB}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    // With no filters, the generated report shares the target-options
    // query's key, which is already cached fresh (staleTime 30s), so nothing
    // would be fetched. Selecting one focus area changes the filters key and
    // makes Generate issue a real request.
    await page.getByRole("button", { name: "Focus areas", exact: true }).click();
    await page.getByRole("checkbox").first().check();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Generate report", exact: true }).click();

    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
  });

  test("shows the error empty state when the report request fails", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    // Installed before the page loads, so the target-options query and the
    // generated report (same key with no filters) both see the failure.
    await page.route(`**${OPERATIONS_GLOB}`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/reports`);
    await page.getByRole("button", { name: "Generate report", exact: true }).click();

    // ReportsPageContent.tsx: `appliedRequest && reportsQuery.error` renders
    // an EmptyState headed by the request's message (styled text, not <h*>).
    await expect(page.getByText(/Temporary test failure|Failed to load reports/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("reports-empty-state")).toHaveCount(0);
  });

  test("shows the report's empty state when it has no rows", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    // Keep the real payload shape (features/reports/server/operations.ts:
    // OperationsReportPayload) and blank only the default report's rows.
    await page.route(`**${OPERATIONS_GLOB}`, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { reports: { staffHours: unknown[] } };
      body.reports.staffHours = [];
      await route.fulfill({ response, json: body });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/reports`);
    await page.getByRole("button", { name: "Generate report", exact: true }).click();

    // The default report is "Staff hours"; its emptyText comes from
    // features/reports/shared/table.ts.
    const emptyState = page.getByTestId("reports-empty-state");
    await expect(emptyState).toBeVisible({ timeout: 15_000 });
    await expect(emptyState).toContainText("No published schedule for this range.");
    await expect(page.locator("table")).toHaveCount(0);
  });
});
