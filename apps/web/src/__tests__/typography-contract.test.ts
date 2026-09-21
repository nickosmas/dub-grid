import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function resolveWebSource(): string {
  const cwd = process.cwd();
  return existsSync(path.resolve(cwd, "apps/web/src"))
    ? path.resolve(cwd, "apps/web/src")
    : path.resolve(cwd, "src");
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

const webSource = resolveWebSource();
const allProductionSourceFiles = ["app", "components", "features"]
  .flatMap((sourceRoot) => listSourceFiles(path.resolve(webSource, sourceRoot)))
  .filter((filePath) => {
    const relativePath = path.relative(webSource, filePath).replaceAll(path.sep, "/");
    return (
      !relativePath.includes("/__tests__/") && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
    );
  });
const typographyEnforcementSourceFiles = allProductionSourceFiles.filter((filePath) => {
  const relativePath = path.relative(webSource, filePath).replaceAll(path.sep, "/");

  // Only fixed visual artifacts are excluded. Real route, auth, onboarding,
  // and landing controls stay in scope even when they sit beside a mockup.
  const artifactExceptions = ["components/ui/calendar-date-picker.tsx"];

  return (
    !relativePath.startsWith("app/api/") &&
    !/(?:^|\/)(?:Print|Social)[^/]*\.(?:ts|tsx)$/.test(relativePath) &&
    !artifactExceptions.includes(relativePath)
  );
});

function collectViolations(pattern: RegExp): string[] {
  return typographyEnforcementSourceFiles.flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    return pattern.test(source)
      ? [path.relative(webSource, filePath).replaceAll(path.sep, "/")]
      : [];
  });
}

function collectUnexpectedMatchCounts(
  pattern: RegExp,
  expectedCounts: Record<string, number>,
): string[] {
  const actualCounts = Object.fromEntries(
    typographyEnforcementSourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const count = source.match(pattern)?.length ?? 0;
      return count > 0
        ? [[path.relative(webSource, filePath).replaceAll(path.sep, "/"), count]]
        : [];
    }),
  );

  return [...new Set([...Object.keys(expectedCounts), ...Object.keys(actualCounts)])]
    .filter((filePath) => actualCounts[filePath] !== expectedCounts[filePath])
    .map(
      (filePath) =>
        `${filePath}: expected ${expectedCounts[filePath] ?? 0}, received ${actualCounts[filePath] ?? 0}`,
    );
}

function collectThinInteractiveOverrides(): string[] {
  return allProductionSourceFiles
    .filter((filePath) => /\.tsx$/.test(filePath))
    .flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const violations: string[] = [];

      function inspect(node: ts.Node): void {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = node.tagName.getText(sourceFile);
          const isInteractive =
            /^(?:button|input|select|textarea)$/.test(tagName) ||
            /(?:Button|Input|Select|Switch|Toggle)$/.test(tagName);

          if (isInteractive) {
            for (const attribute of node.attributes.properties) {
              if (!ts.isJsxAttribute(attribute)) continue;
              const attributeName = attribute.name.getText(sourceFile);

              if (
                attributeName === "className" &&
                attribute.initializer &&
                /\bfont-normal\b/.test(attribute.initializer.getText(sourceFile))
              ) {
                const line =
                  sourceFile.getLineAndCharacterOfPosition(attribute.getStart()).line + 1;
                violations.push(`${path.relative(webSource, filePath)}:${line} <${tagName}>`);
              }

              if (
                /^(?:activeF|f)ontWeight$/.test(attributeName) &&
                attribute.initializer &&
                ((ts.isStringLiteral(attribute.initializer) &&
                  attribute.initializer.text === "400") ||
                  (ts.isJsxExpression(attribute.initializer) &&
                    attribute.initializer.expression &&
                    ts.isNumericLiteral(attribute.initializer.expression) &&
                    attribute.initializer.expression.text === "400"))
              ) {
                const line =
                  sourceFile.getLineAndCharacterOfPosition(attribute.getStart()).line + 1;
                violations.push(`${path.relative(webSource, filePath)}:${line} <${tagName}>`);
              }

              if (
                attributeName === "style" &&
                attribute.initializer &&
                ts.isJsxExpression(attribute.initializer) &&
                attribute.initializer.expression &&
                ts.isObjectLiteralExpression(attribute.initializer.expression)
              ) {
                const thinWeight = attribute.initializer.expression.properties.some((property) => {
                  if (
                    !ts.isPropertyAssignment(property) ||
                    property.name.getText(sourceFile) !== "fontWeight"
                  ) {
                    return false;
                  }
                  return (
                    (ts.isNumericLiteral(property.initializer) &&
                      property.initializer.text === "400") ||
                    (ts.isStringLiteral(property.initializer) &&
                      property.initializer.text === "400")
                  );
                });

                if (thinWeight) {
                  const line =
                    sourceFile.getLineAndCharacterOfPosition(attribute.getStart()).line + 1;
                  violations.push(`${path.relative(webSource, filePath)}:${line} <${tagName}>`);
                }
              }
            }
          }
        }

        ts.forEachChild(node, inspect);
      }

      inspect(sourceFile);
      return violations;
    });
}

const documentedMicroTextCounts = {
  "app/globals.css": 1,
  "components/dashboard/DonutChart.tsx": 1,
  "components/schedule-grid/badges.tsx": 1,
};

const documentedHeavyWeightCounts = {
  "app/page.tsx": 7,
};

const documentedUppercaseStyleCounts = {
  "app/(app)/alerts/AlertsInboxPage.tsx": 1,
  "components/MobileDayView.tsx": 2,
  "components/PillTimeEditor.tsx": 2,
  "components/ScheduleOperationModal.tsx": 1,
  "components/ShiftEditPanel.tsx": 2,
  "components/ShiftPicker.tsx": 1,
  "components/dashboard/UserDashboard.tsx": 3,
  "components/dashboard/expanded/ExpandedCoverage.tsx": 1,
  "components/gridmaster/AllUsersView.tsx": 2,
  "components/gridmaster/GridmasterAccountsView.tsx": 2,
  "components/gridmaster/GridmasterDashboard.tsx": 2,
  "components/gridmaster/GridmasterPortal.tsx": 1,
  "components/gridmaster/ImpersonationHistory.tsx": 1,
  "components/gridmaster/OrganizationDetail.tsx": 2,
  "components/settings/Indicators.tsx": 1,
  "components/settings/ShiftCategories.tsx": 1,
  "components/staff/ProfileChangeRequestQueue.tsx": 1,
  "components/staff-detail/RecurringScheduleCard.tsx": 1,
};

// Alpha is reserved for text embedded in color-coded schedule cells and
// fixed-size previews, where it preserves hierarchy within the same hue.
// Ordinary supporting copy must use a semantic foreground token instead so
// its contrast remains predictable on every theme surface.
const documentedOpacityTextCounts = {
  "components/PublishHistoryPanel.tsx": 1,
  "components/RepeatForm.tsx": 1,
  "components/ScheduleGrid.tsx": 7,
  "components/ShiftEditPanel.tsx": 4,
  "components/ShiftPicker.tsx": 1,
  "components/dashboard/MyScheduleRow.tsx": 1,
  "components/settings/DisplayMode.tsx": 1,
  "components/settings/Jobs.tsx": 1,
  "components/staff/RecurringScheduleSection.tsx": 2,
};

const globalsCss = readFileSync(path.resolve(webSource, "app/globals.css"), "utf8");
const rootLayout = readFileSync(path.resolve(webSource, "app/layout.tsx"), "utf8");
const landingPage = readFileSync(path.resolve(webSource, "app/page.tsx"), "utf8");
const logo = readFileSync(path.resolve(webSource, "components/Logo.tsx"), "utf8");
const sharedButton = readFileSync(path.resolve(webSource, "components/ui/button.tsx"), "utf8");
const sharedInput = readFileSync(path.resolve(webSource, "components/ui/input.tsx"), "utf8");
const sharedSidebar = readFileSync(path.resolve(webSource, "components/ui/sidebar.tsx"), "utf8");
const staffView = readFileSync(path.resolve(webSource, "components/StaffView.tsx"), "utf8");
const settingsShell = readFileSync(
  path.resolve(webSource, "components/settings/SettingsShell.tsx"),
  "utf8",
);
const sharedStyles = readFileSync(path.resolve(webSource, "lib/styles.ts"), "utf8");
const formField = readFileSync(path.resolve(webSource, "components/FormField.tsx"), "utf8");
const sharedTable = readFileSync(path.resolve(webSource, "components/ui/table.tsx"), "utf8");
const requestDemoPage = readFileSync(path.resolve(webSource, "app/request-demo/page.tsx"), "utf8");
const printScheduleView = readFileSync(
  path.resolve(webSource, "components/PrintScheduleView.tsx"),
  "utf8",
);
const emailTheme = readFileSync(path.resolve(webSource, "emails/components/theme.ts"), "utf8");
const emailLayout = readFileSync(
  path.resolve(webSource, "emails/components/EmailLayout.tsx"),
  "utf8",
);
const scheduleGrid = readFileSync(path.resolve(webSource, "components/ScheduleGrid.tsx"), "utf8");
const mobileDayView = readFileSync(path.resolve(webSource, "components/MobileDayView.tsx"), "utf8");
const dashboardHero = readFileSync(
  path.resolve(webSource, "components/dashboard/DashboardHero.tsx"),
  "utf8",
);
const userDashboard = readFileSync(
  path.resolve(webSource, "components/dashboard/UserDashboard.tsx"),
  "utf8",
);
const reportsPage = readFileSync(
  path.resolve(webSource, "app/(app)/reports/ReportsPageContent.tsx"),
  "utf8",
);
const cookiePolicyPage = readFileSync(
  path.resolve(webSource, "app/cookie-policy/page.tsx"),
  "utf8",
);
const membersSection = readFileSync(
  path.resolve(webSource, "components/staff/MembersSection.tsx"),
  "utf8",
);
const stringListSettings = readFileSync(
  path.resolve(webSource, "components/settings/StringListSettings.tsx"),
  "utf8",
);

const productiveRoles = [
  "page-title",
  "section-title",
  "component-heading",
  "content-group-heading",
  "body",
  "navigation",
  "navigation-section",
  "control",
  "field-title",
  "table-heading",
  "metadata",
  "badge",
] as const;

describe("productive typography contract", () => {
  it("separates the Inter product family from the DM Sans brand family", () => {
    expect(rootLayout).toContain('import { DM_Sans, DM_Mono, Inter } from "next/font/google";');
    expect(rootLayout).toContain('variable: "--font-inter"');
    expect(rootLayout).toContain(
      'className={cn(inter.variable, dmSans.variable, dmMono.variable, "font-sans")}',
    );
    expect(globalsCss).toContain('--font-sans: var(--font-inter), "Inter", system-ui, sans-serif;');
    expect(globalsCss).toContain(
      '--font-brand: var(--font-dm-sans), "DM Sans", system-ui, sans-serif;',
    );
    expect(globalsCss).toMatch(
      /html,\s*body\s*\{[\s\S]*?font-family:\s*var\(--font-inter\), "Inter", system-ui, sans-serif;/,
    );
    expect(globalsCss).toMatch(/html,\s*body\s*\{[\s\S]*?font-optical-sizing:\s*auto;/);
  });

  it("keeps brand typography behind an explicit DM Sans boundary", () => {
    expect(globalsCss).toMatch(
      /\.dg-font-brand-heading\s*\{[\s\S]*?font-family:\s*var\(--font-dm-sans\), "DM Sans", system-ui, sans-serif;/,
    );
    expect(landingPage).toMatch(/<h1 className="dg-font-brand-heading\s/);
    expect(logo).toContain("fontFamily: \"'DM Sans', sans-serif\"");
  });

  it("bounds every production DM Sans use to an explicit brand surface", () => {
    expect(
      collectUnexpectedMatchCounts(/(?:var\(--font-dm-sans\)|["']DM Sans["'])/g, {
        "app/globals.css": 4,
        "app/logo-grid.tsx": 2,
        "app/opengraph-image.tsx": 1,
        "app/twitter-image.tsx": 1,
        "components/Logo.tsx": 1,
      }),
    ).toEqual([]);

    const landingHeadings = landingPage.match(/<h[123]\b/g) ?? [];
    const brandedLandingHeadings =
      landingPage.match(/<h[123]\s+className="dg-font-brand-heading\b/g) ?? [];
    expect(brandedLandingHeadings).toHaveLength(landingHeadings.length);

    const requestDemoHeadings = requestDemoPage.match(/<h1\b/g) ?? [];
    const brandedRequestDemoHeadings =
      requestDemoPage.match(/<h1\s+className="dg-font-brand-heading"/g) ?? [];
    expect(brandedRequestDemoHeadings).toHaveLength(requestDemoHeadings.length);
  });

  it("keeps ordinary email and print copy on Inter", () => {
    expect(emailTheme).toContain('"Inter, -apple-system');
    expect(emailTheme).not.toContain("DM Sans");
    expect(emailLayout).not.toContain('fontFamily="DM Sans"');
    expect(printScheduleView).toContain("font-family: 'Inter'");
    expect(printScheduleView).toContain("fontFamily: \"'Inter'");
  });

  it("uses one bounded tabular-numeral contract for operational figures", () => {
    expect(globalsCss).toMatch(/\.dg-tabular-nums\s*\{\s*font-variant-numeric:\s*tabular-nums;/);
    expect(scheduleGrid).toContain('className="dg-tabular-nums"');
    expect(scheduleGrid).toContain("dg-grid-slot--tally dg-tabular-nums");
    expect(mobileDayView).toContain('className="dg-tabular-nums"');
    expect(dashboardHero).toContain('className="dg-tabular-nums"');
    expect(userDashboard).toContain('className="dg-tabular-nums"');
    expect(reportsPage).toContain('className="dg-tabular-nums"');
    expect(printScheduleView).toContain('fontVariantNumeric: "tabular-nums"');
    expect(globalsCss).not.toMatch(/html,\s*body\s*\{[^}]*font-variant-numeric:/);
  });

  it("enforces real public, auth, onboarding, and landing UI", () => {
    const enforcedPaths = new Set(
      typographyEnforcementSourceFiles.map((filePath) =>
        path.relative(webSource, filePath).replaceAll(path.sep, "/"),
      ),
    );

    expect(enforcedPaths.has("app/(app)/login/OrgLogin.tsx")).toBe(true);
    expect(enforcedPaths.has("app/(app)/onboarding/page.tsx")).toBe(true);
    expect(enforcedPaths.has("app/page.tsx")).toBe(true);
    expect(enforcedPaths.has("components/ThemeToggleButton.tsx")).toBe(true);
    expect(enforcedPaths.has("components/landing/LandingPhone.tsx")).toBe(true);
    expect(enforcedPaths.has("components/landing/ScheduleGridMockup.tsx")).toBe(false);
  });

  it("defines every semantic role as tokens and a reusable class", () => {
    for (const role of productiveRoles) {
      expect(globalsCss).toContain(`--dg-type-${role}-size:`);
      expect(globalsCss).toContain(`--dg-type-${role}-weight:`);
      expect(globalsCss).toContain(`--dg-type-${role}-line-height:`);
      expect(globalsCss).toContain(`--dg-type-${role}-letter-spacing:`);
      expect(globalsCss).toContain(`--dg-type-${role}-color:`);
      expect(globalsCss).toContain(`.dg-type-${role} {`);
    }
  });

  it("maps every semantic class to its matching role weight", () => {
    for (const role of productiveRoles) {
      expect(globalsCss).toMatch(
        new RegExp(
          `\\.dg-type-${role}\\s*\\{[\\s\\S]*?font-weight:\\s*var\\(--dg-type-${role}-weight\\);`,
        ),
      );
    }
  });

  it("keeps productive text on the approved size and weight scale", () => {
    expect(globalsCss).toContain("--dg-type-scale-page-size: 28px;");
    expect(globalsCss).toContain("--dg-type-scale-page-size-mobile: 24px;");
    expect(globalsCss).toContain("--dg-type-scale-section-size: 20px;");
    expect(globalsCss).toContain("--dg-type-scale-section-size-mobile: 18px;");
    expect(globalsCss).toContain("--dg-type-scale-component-size: 16px;");
    expect(globalsCss).toContain("--dg-type-scale-content-size: 14px;");
    expect(globalsCss).toContain("--dg-type-scale-label-size: 13px;");
    expect(globalsCss).toContain("--dg-type-scale-metadata-size: 12px;");

    expect(globalsCss).toContain("--dg-type-page-title-size: var(--dg-type-scale-page-size);");
    expect(globalsCss).toContain(
      "--dg-type-section-title-size: var(--dg-type-scale-section-size);",
    );
    expect(globalsCss).toContain(
      "--dg-type-component-heading-size: var(--dg-type-scale-component-size);",
    );
    expect(globalsCss).toContain(
      "--dg-type-content-group-heading-size: var(--dg-type-scale-content-size);",
    );
    expect(globalsCss).toContain("--dg-type-body-size: var(--dg-type-scale-content-size);");
    expect(globalsCss).toContain("--dg-type-navigation-size: var(--dg-type-scale-content-size);");
    expect(globalsCss).toContain(
      "--dg-type-navigation-section-size: var(--dg-type-scale-content-size);",
    );
    expect(globalsCss).toContain("--dg-type-control-size: var(--dg-type-scale-content-size);");
    expect(globalsCss).toContain("--dg-type-field-title-size: var(--dg-type-scale-label-size);");
    expect(globalsCss).toContain("--dg-type-table-heading-size: var(--dg-type-scale-label-size);");
    expect(globalsCss).toContain("--dg-type-metadata-size: var(--dg-type-scale-metadata-size);");
    expect(globalsCss).toContain("--dg-type-badge-size: var(--dg-type-scale-metadata-size);");

    const productiveWeights = [...globalsCss.matchAll(/--dg-type-[\w-]+-weight:\s*(\d+);/g)].map(
      (match) => Number(match[1]),
    );

    expect(productiveWeights).toEqual(expect.arrayContaining([400, 500, 600, 700]));
    expect(productiveWeights.every((weight) => [400, 500, 600, 700].includes(weight))).toBe(true);
  });

  it("uses sentence case for field and table titles", () => {
    expect(globalsCss).toContain("--dg-type-field-title-transform: none;");
    expect(globalsCss).toContain("--dg-type-table-heading-transform: none;");
  });

  it("maps title roles to the approved mobile sizes", () => {
    expect(globalsCss).toContain(
      "--dg-type-page-title-size-mobile: var(--dg-type-scale-page-size-mobile);",
    );
    expect(globalsCss).toContain(
      "--dg-type-section-title-size-mobile: var(--dg-type-scale-section-size-mobile);",
    );
    expect(globalsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?--dg-type-page-title-size:\s*var\(--dg-type-page-title-size-mobile\);/,
    );
    expect(globalsCss).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?--dg-type-section-title-size:\s*var\(--dg-type-section-title-size-mobile\);/,
    );
  });

  it("maps semantic foregrounds through theme-aware color tokens", () => {
    expect(globalsCss).toContain(
      "--dg-type-attention-primary-color: var(--dg-color-text-primary);",
    );
    expect(globalsCss).toContain(
      "--dg-type-attention-secondary-color: var(--dg-color-text-label);",
    );
    expect(globalsCss).toContain("--dg-type-attention-muted-color: var(--dg-color-text-label);");
    expect(globalsCss).toContain("--dg-color-text-quiet: #858585;");
    expect(globalsCss).toContain("--dg-color-text-label: #666666;");
    expect(globalsCss).toMatch(/\.dark\s*\{[\s\S]*?--dg-color-text-quiet:\s*#9797a0;/);
    expect(globalsCss).toMatch(/\.dark\s*\{[\s\S]*?--dg-color-text-label:\s*#a1a1aa;/);
    expect(globalsCss).toContain(
      "--dg-type-navigation-color: var(--dg-type-attention-primary-color);",
    );
    expect(globalsCss).toContain(
      "--dg-type-field-title-color: var(--dg-type-attention-secondary-color);",
    );
    expect(globalsCss).toContain(
      "--dg-type-content-group-heading-color: var(--dg-type-attention-secondary-color);",
    );
    expect(globalsCss).toContain(
      "--dg-type-table-heading-color: var(--dg-type-attention-secondary-color);",
    );
    expect(globalsCss).toContain("--dg-type-metadata-color: var(--dg-type-attention-muted-color);");
    expect(globalsCss).toContain(".dg-type-attention-primary {");
    expect(globalsCss).toContain(".dg-type-attention-secondary {");
    expect(globalsCss).toContain(".dg-type-attention-muted {");
  });

  it("applies the contract to shared controls", () => {
    expect(globalsCss).toContain("font-size: var(--dg-type-control-size);");
    expect(globalsCss).toContain("font-size: var(--dg-type-navigation-size);");
    expect(globalsCss).toContain("font-size: var(--dg-type-badge-size);");
    expect(sharedButton).toContain("text-[length:var(--dg-type-control-size)]");
    expect(sharedButton).not.toMatch(/text-\[(?:11|12)px\]/);
    expect(sharedInput).toContain("text-[length:var(--dg-type-control-size)]");
    expect(sharedInput).toContain("font-medium");
    expect(sharedInput).not.toContain("font-normal");
  });

  it("rejects route-local thin text overrides on interactive controls app-wide", () => {
    expect(collectThinInteractiveOverrides()).toEqual([]);
  });

  it("rejects unsupported thin weights and opacity-dimmed supporting text", () => {
    const thinWeightViolations = collectViolations(
      /(?:fontWeight\s*:\s*["']?(?:100|200|300)\b|font-weight\s*:\s*(?:100|200|300)\b|font-(?:thin|extralight|light)\b|font-\[(?:100|200|300)\])/,
    );
    const opacityTextViolations = collectUnexpectedMatchCounts(
      /<(?:span|p|label|button|a|h[1-6]|div)\b[^>]*style=\{\{[^}]*?opacity:\s*0\.(?:[1-9]\d*)[^}]*?\}\}/g,
      documentedOpacityTextCounts,
    );

    expect(thinWeightViolations).toEqual([]);
    expect(opacityTextViolations).toEqual([]);
  });

  it("keeps available sidebar labels and icons on the primary navigation foreground", () => {
    expect(sharedSidebar).toContain("text-[var(--dg-type-navigation-color)]");
    expect(settingsShell).toContain("text-[var(--dg-type-navigation-color)]");
    expect(globalsCss).toContain("--dg-type-navigation-weight: 500;");
    expect(sharedSidebar).toContain("font-medium");
    expect(staffView).not.toContain("font-normal");
    expect(globalsCss).toMatch(
      /\.dg-mobile-section-chip\s*\{[\s\S]*?font-weight:\s*var\(--dg-type-navigation-weight\);[\s\S]*?color:\s*var\(--dg-type-navigation-color\);/,
    );
    expect(globalsCss).toMatch(
      /\.dg-bottom-sheet-footer-btn\s*\{[\s\S]*?font-weight:\s*var\(--dg-type-navigation-weight\);[\s\S]*?color:\s*var\(--dg-type-navigation-color\);/,
    );
    expect(settingsShell).not.toContain('className="h-9 text-[var(--dg-color-text-faint)]');
  });

  it("gives sidebar section titles a larger semibold secondary role", () => {
    expect(globalsCss).toContain(
      "--dg-type-navigation-section-size: var(--dg-type-scale-content-size);",
    );
    expect(globalsCss).toContain("--dg-type-navigation-section-weight: 600;");
    expect(globalsCss).toContain("--dg-type-navigation-section-color: var(--dg-color-text-quiet);");
    expect(sharedSidebar).toContain(
      "text-[length:var(--dg-type-navigation-section-size)] font-semibold",
    );
    expect(sharedSidebar).toContain("text-[var(--dg-type-navigation-section-color)]");
    expect(settingsShell).not.toContain("--dg-type-field-title-size");
  });

  it("applies sentence-case semantic roles to shared fields and table headings", () => {
    expect(sharedStyles).toContain('fontSize: "var(--dg-type-table-heading-size)"');
    expect(sharedStyles).toContain('fontSize: "var(--dg-type-field-title-size)"');
    expect(formField).toContain('fontSize: "var(--dg-type-field-title-size)"');
    expect(formField).not.toContain('textTransform: "uppercase"');
    expect(sharedTable).toContain('className={cn(\n        "dg-type-table-heading');
    expect(sharedTable).toContain('textTransform: "none"');
    expect(membersSection).not.toMatch(/<TableHead[^>]*uppercase/);
  });

  it("keeps content group headings stronger than their nested field labels", () => {
    expect(globalsCss).toContain("--dg-type-content-group-heading-weight: 600;");
    expect(globalsCss).toContain("--dg-type-field-title-weight: 500;");
    expect(globalsCss).toContain(
      "--dg-type-content-group-heading-size: var(--dg-type-scale-content-size);",
    );
    expect(globalsCss).toContain("--dg-type-field-title-size: var(--dg-type-scale-label-size);");

    const contentGroupHeadingSources = [
      "app/(app)/alerts/AlertsInboxPage.tsx",
      "components/EditEmployeePanel.tsx",
      "components/PermissionsEditor.tsx",
      "components/ShiftEditPanel.tsx",
      "components/dashboard/ActionQueueCard.tsx",
      "components/dashboard/CoverageBySectionCard.tsx",
      "components/activity/ActivityLogParts.tsx",
      "components/profile/SessionList.tsx",
      "components/settings/BillingSettings.tsx",
      "components/settings/Coverage.tsx",
      "components/settings/Jobs.tsx",
      "components/staff/FilterPanelShell.tsx",
      "components/staff/ManagementStaffPanel.tsx",
      "components/staff/StaffReadOnlyDetailPanel.tsx",
    ];

    for (const sourcePath of contentGroupHeadingSources) {
      const source = readFileSync(path.resolve(webSource, sourcePath), "utf8");
      expect(source, sourcePath).toContain("dg-type-content-group-heading");
    }

    expect(
      readFileSync(path.resolve(webSource, "components/EditEmployeePanel.tsx"), "utf8"),
    ).not.toMatch(/const sectionLabel[\s\S]*?--dg-type-field-title/);
  });

  it("keeps public and auth field and table labels on the same semantic hierarchy", () => {
    expect(globalsCss).toMatch(
      /\.dg-auth-field-label\s*\{[\s\S]*?font-size:\s*var\(--dg-fs-label\);[\s\S]*?font-weight:\s*var\(--dg-type-field-title-weight\);[\s\S]*?color:\s*var\(--dg-color-text-label\);/,
    );
    expect(requestDemoPage).toContain('fontWeight: "var(--dg-type-field-title-weight)"');
    expect(requestDemoPage).toContain('color: "var(--dg-color-text-label)"');
    expect(cookiePolicyPage).toContain('fontWeight: "var(--dg-type-table-heading-weight)"');
    expect(cookiePolicyPage).toContain('fontSize: "var(--dg-fs-label)"');
    expect(cookiePolicyPage).toContain('color: "var(--dg-color-text-label)"');
  });

  it("keeps configurable settings headings in sentence case", () => {
    expect(stringListSettings).toContain('"Full name"');
    expect(stringListSettings).toContain('"Schedule eligibility"');
    expect(stringListSettings).not.toContain('textTransform: "uppercase"');
  });

  it("rejects undocumented raw micro text and unsupported heavy weights", () => {
    const microTextViolations = collectUnexpectedMatchCounts(
      /(?:fontSize\s*(?::|=)\s*[^,\n]*(?:\b8\b|\b9\b|\b10\b|\b11\b)|font-size:\s*(?:8|9|10|11)px|text-\[(?:8|9|10|11)px\])/g,
      documentedMicroTextCounts,
    );
    const heavyWeightViolations = collectUnexpectedMatchCounts(
      /(?:fontWeight\s*:\s*["']?(?:750|800|900)\b|font-(?:extrabold|black)\b|font-\[(?:750|800|900)\])/g,
      documentedHeavyWeightCounts,
    );

    expect(microTextViolations).toEqual([]);
    expect(heavyWeightViolations).toEqual([]);
  });

  it("rejects uppercase field-title and table-heading semantic roles", () => {
    const semanticUppercaseViolations = collectViolations(
      /(?:dg-type-(?:field-title|table-heading)[^\n]*\buppercase\b|\buppercase\b[^\n]*dg-type-(?:field-title|table-heading)|--dg-type-(?:field-title|table-heading)-transform:\s*uppercase)/,
    );

    expect(semanticUppercaseViolations).toEqual([]);
  });

  it("rejects undocumented uppercase styling on productive surfaces", () => {
    const uppercaseStyleViolations = collectUnexpectedMatchCounts(
      /(?:textTransform\s*:\s*["']uppercase["']|className[^\n]*\buppercase\b)/g,
      documentedUppercaseStyleCounts,
    );

    expect(uppercaseStyleViolations).toEqual([]);
  });
});
