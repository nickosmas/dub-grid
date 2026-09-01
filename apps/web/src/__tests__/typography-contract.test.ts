import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
const productiveSourceFiles = ["app/(app)", "components", "features"]
  .flatMap((sourceRoot) => listSourceFiles(path.resolve(webSource, sourceRoot)))
  .filter((filePath) => {
    const relativePath = path.relative(webSource, filePath).replaceAll(path.sep, "/");

    // These surfaces intentionally use a separate expressive/editorial scale,
    // render a fixed-size preview or output artifact, or contain a compact
    // calendar grid whose typography is not ordinary readable product copy.
    const documentedExceptions = [
      "app/(app)/accept-invite/",
      "app/(app)/accept-terms/",
      "app/(app)/forgot-password/",
      "app/(app)/goodbye/",
      "app/(app)/login/",
      "app/(app)/onboarding/",
      "app/(app)/reset-password/",
      "app/(app)/verify-email/",
      "components/account/AppearancePreview.tsx",
      "components/auth/",
      "components/landing/",
      "components/onboarding/",
      "components/ui/calendar-date-picker.tsx",
    ];

    return (
      !relativePath.includes("/__tests__/") &&
      !/\.test\.[^.]+$/.test(relativePath) &&
      !/(?:^|\/)(?:Print|Social)[^/]*\.(?:ts|tsx)$/.test(relativePath) &&
      !documentedExceptions.some((exceptionPath) => relativePath.startsWith(exceptionPath))
    );
  });

function collectViolations(pattern: RegExp): string[] {
  return productiveSourceFiles.flatMap((filePath) => {
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
    productiveSourceFiles.flatMap((filePath) => {
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

const documentedMicroTextCounts = {
  "components/dashboard/DonutChart.tsx": 1,
  "components/schedule-grid/badges.tsx": 1,
};

const documentedUppercaseStyleCounts = {
  "app/(app)/alerts/AlertsInboxPage.tsx": 1,
  "components/MobileDayView.tsx": 2,
  "components/PillTimeEditor.tsx": 2,
  "components/ScheduleOperationModal.tsx": 1,
  "components/ShiftEditPanel.tsx": 2,
  "components/ShiftPicker.tsx": 1,
  "components/ShiftRequestBoard.tsx": 2,
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

const globalsCss = readFileSync(path.resolve(webSource, "app/globals.css"), "utf8");
const sharedButton = readFileSync(path.resolve(webSource, "components/ui/button.tsx"), "utf8");
const sharedInput = readFileSync(path.resolve(webSource, "components/ui/input.tsx"), "utf8");
const sharedSidebar = readFileSync(path.resolve(webSource, "components/ui/sidebar.tsx"), "utf8");
const settingsShell = readFileSync(
  path.resolve(webSource, "components/settings/SettingsShell.tsx"),
  "utf8",
);
const sharedStyles = readFileSync(path.resolve(webSource, "lib/styles.ts"), "utf8");
const formField = readFileSync(path.resolve(webSource, "components/FormField.tsx"), "utf8");
const sharedTable = readFileSync(path.resolve(webSource, "components/ui/table.tsx"), "utf8");
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
      "--dg-type-attention-secondary-color: var(--dg-color-text-muted);",
    );
    expect(globalsCss).toContain("--dg-type-attention-muted-color: var(--dg-color-text-subtle);");
    expect(globalsCss).toContain(
      "--dg-type-navigation-color: var(--dg-type-attention-primary-color);",
    );
    expect(globalsCss).toContain(
      "--dg-type-field-title-color: var(--dg-type-attention-secondary-color);",
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
  });

  it("keeps available sidebar labels and icons on the primary navigation foreground", () => {
    expect(sharedSidebar).toContain("text-[var(--dg-type-navigation-color)]");
    expect(settingsShell).toContain("text-[var(--dg-type-navigation-color)]");
    expect(globalsCss).toContain("--dg-type-navigation-weight: 500;");
    expect(sharedSidebar).toContain("font-medium");
    expect(settingsShell).not.toContain('className="h-9 text-[var(--dg-color-text-faint)]');
  });

  it("gives sidebar section titles a larger semibold secondary role", () => {
    expect(globalsCss).toContain(
      "--dg-type-navigation-section-size: var(--dg-type-scale-content-size);",
    );
    expect(globalsCss).toContain("--dg-type-navigation-section-weight: 600;");
    expect(globalsCss).toContain(
      "--dg-type-navigation-section-color: var(--dg-type-attention-secondary-color);",
    );
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
    const heavyWeightViolations = collectViolations(
      /(?:fontWeight\s*:\s*["']?(?:750|800|900)\b|font-(?:extrabold|black)\b|font-\[(?:750|800|900)\])/,
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
