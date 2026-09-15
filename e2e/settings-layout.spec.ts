import { expect, test } from "@playwright/test";
import { clearBlockingOverlays, loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

test("settings layouts stay contained as the desktop viewport narrows", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);

  for (const width of [1280, 900, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings?section=org-display`);
    await clearBlockingOverlays(page);
    await expect(page.getByText("Choose a display mode")).toBeVisible();

    const displayLayout = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>("[data-display-mode-options]");
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-display-mode-options] > button"),
      );
      const gridRect = grid?.getBoundingClientRect();
      return {
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        rootWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        cardCount: cards.length,
        cardsContained: cards.every((card) => {
          const rect = card.getBoundingClientRect();
          return !!gridRect && rect.left >= gridRect.left - 1 && rect.right <= gridRect.right + 1;
        }),
      };
    });
    expect(displayLayout.pageOverflow, `display page overflow at ${width}px`).toBe(false);
    expect(displayLayout.cardCount).toBe(2);
    expect(displayLayout.cardsContained).toBe(true);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings?section=staff-roles`);
    await expect(page.getByText("Schedule eligibility")).toBeVisible();
    const rolesLayout = await page.evaluate(() => {
      const table = document.querySelector<HTMLElement>("[data-compact-role-table]");
      const card = table?.closest<HTMLElement>(".dg-page-enter");
      const heading = document.querySelector<HTMLElement>("h1");
      const header = table?.querySelector<HTMLElement>(":scope > div");
      const columnWidths = header
        ? Array.from(header.children, (column) => column.getBoundingClientRect().width)
        : [];
      return {
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        width: table?.getBoundingClientRect().width ?? 0,
        maxWidth: table ? Number.parseFloat(getComputedStyle(table).maxWidth) : 0,
        rolePills: document.querySelectorAll(".dg-role-name-view-pill").length,
        plainNames: document.querySelectorAll("[data-role-name-text]").length,
        leftEdgesAligned:
          !!card &&
          !!heading &&
          Math.abs(card.getBoundingClientRect().left - heading.getBoundingClientRect().left) <= 1,
        columnWidthSpread:
          columnWidths.length > 0 ? Math.max(...columnWidths) - Math.min(...columnWidths) : null,
      };
    });
    expect(rolesLayout.pageOverflow).toBe(false);
    expect(rolesLayout.width).toBeGreaterThan(0);
    expect(rolesLayout.width).toBeLessThanOrEqual(1280);
    expect(rolesLayout.maxWidth).toBeGreaterThan(0);
    expect(rolesLayout.maxWidth).toBeLessThanOrEqual(1280);
    expect(rolesLayout.rolePills).toBe(0);
    expect(rolesLayout.plainNames).toBeGreaterThan(0);
    expect(rolesLayout.leftEdgesAligned).toBe(true);
    expect(rolesLayout.columnWidthSpread).not.toBeNull();
    expect(rolesLayout.columnWidthSpread!).toBeLessThanOrEqual(1);

    const editButton = page.getByRole("button", { name: "Edit" });
    if (await editButton.isVisible()) {
      await editButton.click();
      const editLayout = await page.evaluate(() => {
        const table = document.querySelector<HTMLElement>("[data-compact-role-table]");
        const nameFields = Array.from(
          table?.querySelectorAll<HTMLTextAreaElement>("textarea") ?? [],
        );
        const longNameFields = nameFields.filter((field) => field.value.length > 30);
        return {
          mode: table?.dataset.settingsTableMode,
          maxWidth: table ? Number.parseFloat(getComputedStyle(table).maxWidth) : 0,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          longNameCount: longNameFields.length,
          longNameMeasurements: longNameFields.map((field) => ({
            value: field.value,
            clientWidth: field.clientWidth,
            scrollWidth: field.scrollWidth,
            clientHeight: field.clientHeight,
            scrollHeight: field.scrollHeight,
          })),
          longNamesFullyVisible: longNameFields.every(
            (field) =>
              field.scrollWidth <= field.clientWidth + 1 &&
              field.scrollHeight <= field.clientHeight + 1,
          ),
        };
      });
      expect(editLayout.mode).toBe("edit");
      expect(editLayout.maxWidth).toBeGreaterThan(rolesLayout.maxWidth);
      expect(editLayout.maxWidth).toBeLessThanOrEqual(1280);
      expect(editLayout.pageOverflow).toBe(false);
      expect(editLayout.longNameCount).toBeGreaterThan(0);
      expect(
        editLayout.longNamesFullyVisible,
        JSON.stringify(editLayout.longNameMeasurements),
      ).toBe(true);
    }
  }
});
