import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { resolve } from "path";

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  return existsSync(resolve(cwd, "apps/web/src")) ? cwd : resolve(cwd, "../..");
}

const sourceRoot = resolve(resolveRepoRoot(), "apps/web/src");
const publicRoot = resolve(resolveRepoRoot(), "apps/web/public");
const rootLayout = readFileSync(resolve(sourceRoot, "app/layout.tsx"), "utf-8");
const globalsCss =
  readFileSync(resolve(sourceRoot, "app/globals.css"), "utf-8") +
  readFileSync(resolve(sourceRoot, "app/app-ui.css"), "utf-8");
const lightThemeCss = globalsCss.slice(0, globalsCss.indexOf(".dark {"));
const globalError = readFileSync(resolve(sourceRoot, "app/global-error.tsx"), "utf-8");
const appShell = readFileSync(resolve(sourceRoot, "components/AppShell.tsx"), "utf-8");
const themePreference = readFileSync(resolve(sourceRoot, "lib/theme-preference.ts"), "utf-8");
const themeSeed = readFileSync(resolve(publicRoot, "dg-theme-seed.js"), "utf-8");

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.(css|tsx?|jsx?)$/.test(entry) && !/\.(?:test|spec)\./.test(entry) ? [path] : [];
  });
}

const productionUiFiles = ["app", "components", "features"]
  .flatMap((directory) => sourceFilesUnder(resolve(sourceRoot, directory)))
  .filter((file) => {
    const relativePath = file.slice(sourceRoot.length + 1);
    return !relativePath.includes("/__tests__/") && !relativePath.startsWith("app/api/");
  });
const documentedNeutralOutputExceptions = new Set([
  // This fallback renders before application styles or theme variables are available.
  "app/global-error.css",
  "app/opengraph-image.tsx",
  "app/twitter-image.tsx",
  "components/PrintScheduleView.tsx",
  "components/settings/AbsenceTypes.tsx",
]);

const staticAuthRoots = [
  resolve(sourceRoot, "components/auth"),
  resolve(sourceRoot, "app/(app)/login"),
  resolve(sourceRoot, "app/(app)/forgot-password"),
  resolve(sourceRoot, "app/(app)/reset-password"),
  resolve(sourceRoot, "app/(app)/accept-invite"),
  resolve(sourceRoot, "app/(app)/verify-email"),
  resolve(sourceRoot, "app/(app)/auth/verify"),
];

describe("theme architecture", () => {
  it("keeps design tokens in authored CSS and out of root document markup", () => {
    expect(rootLayout).toContain("<ThemeProvider>");
    expect(rootLayout).not.toContain("createStaticWebCssVariables");
    expect(rootLayout).not.toContain("createThemedCssText");
    expect(rootLayout).not.toContain("dg-theme-vars");
    expect(rootLayout).toContain('src="/dg-theme-seed.js"');
    expect(rootLayout).toContain('strategy="beforeInteractive"');
    expect(rootLayout).not.toContain("dangerouslySetInnerHTML");
    expect(themePreference).not.toContain("createThemeSeedScript");
    expect(themeSeed).toContain('var storageKey = "theme";');
    expect(themeSeed).toContain('var cookieName = "dg-theme";');
    expect(rootLayout).not.toMatch(/<html[\\s\\S]*?style=/);
    expect(appShell).not.toContain("document.documentElement.style");
    expect(appShell).not.toContain("--app-shell-header-h");
    expect(globalError).not.toContain("dangerouslySetInnerHTML");
    expect(globalError).not.toMatch(/<body[\\s\\S]*?style=/);
    expect(globalsCss).toContain(":root,\n.dg-force-light {");
    expect(globalsCss).toContain(".dark {");
    expect(globalsCss).toContain("--dg-color-bg: #fcfcfc;");
    expect(globalsCss).toContain("--dg-color-bg: #02070f;");
  });

  it("does not paint category pills before the saved theme class is ready", () => {
    expect(globalsCss).toContain(
      'html:not(.light):not(.dark) [data-status-pill-variant="category"]',
    );
    expect(globalsCss).toMatch(
      /html:not\(\.light\):not\(\.dark\) \[data-status-pill-variant="category"\]\s*\{[^}]*visibility:\s*hidden;/,
    );
  });

  it("keeps static auth presentation in authored CSS", () => {
    for (const file of staticAuthRoots.flatMap(sourceFilesUnder)) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toContain("style={{");
      expect(source, file).not.toMatch(/<style(?:\s|>)/);
      expect(source, file).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("uses one neutral hue family for light-mode interface grays", () => {
    const neutralTokens = [
      "--dg-color-text-primary: #171717;",
      "--dg-color-text-secondary: #262626;",
      "--dg-color-text-muted: #525252;",
      "--dg-color-text-subtle: #737373;",
      "--dg-color-text-faint: #858585;",
      "--dg-color-text-quiet: #858585;",
      "--dg-color-text-label: #666666;",
      "--dg-color-surface-alt: #eeeeee;",
      "--dg-color-surface-hover: #e5e5e5;",
      "--dg-color-bg-secondary: #eeeeee;",
      "--dg-color-row-alt: #eeeeee;",
      "--dg-color-row-hover: #e5e5e5;",
      "--dg-color-border-strong: #a3a3a3;",
      "--dg-color-nav-active-bg: #e5e5e5;",
      "--sidebar-accent: #e5e5e5;",
    ];

    for (const token of neutralTokens) {
      expect(lightThemeCss).toContain(token);
    }

    expect(lightThemeCss).not.toMatch(
      /#(?:0f172a|1e293b|475569|64748b|68758a|94a3b8|e7ecf2|f1f5f9|fafbfc|cbd5e1|e2e8f0)\b/i,
    );
    expect(lightThemeCss).not.toMatch(/oklch\(0\.97 0 0\)/i);
    expect(lightThemeCss).not.toMatch(/#f(?:4f4f4|5f5f5|afafa)\b/i);
  });

  it("rejects route-local neutral hue drift across production UI sources", () => {
    const directNeutralPattern =
      /#(?:fff|ffffff|0f172a|1e293b|334155|475569|64748b|94a3b8|cbd5e1|e2e8f0|f1f5f9|f4f4f4|f5f5f5|fafafa)\b|rgba\(\s*(?:15\s*,\s*23\s*,\s*42|51\s*,\s*65\s*,\s*85|71\s*,\s*85\s*,\s*105|100\s*,\s*116\s*,\s*139|148\s*,\s*163\s*,\s*184)\s*,|\b(?:text|bg|border)-(?:slate|gray|zinc)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/i;
    const violations = productionUiFiles.flatMap((file) => {
      const relativePath = file.slice(sourceRoot.length + 1);
      if (
        relativePath === "app/globals.css" ||
        relativePath === "app/app-ui.css" ||
        documentedNeutralOutputExceptions.has(relativePath)
      ) {
        return [];
      }
      return directNeutralPattern.test(readFileSync(file, "utf-8")) ? [relativePath] : [];
    });

    expect(violations).toEqual([]);
    for (const relativePath of [
      "app/api/settings/config/route.ts",
      "lib/db/config.ts",
      "lib/system-jobs.ts",
    ]) {
      expect(readFileSync(resolve(sourceRoot, relativePath), "utf-8"), relativePath).not.toMatch(
        /#(?:1e293b|e2e8f0)\b/i,
      );
    }
    expect(readFileSync(resolve(sourceRoot, "lib/system-jobs.ts"), "utf-8")).toContain(
      'color: "#E5E5E5"',
    );
    expect(readFileSync(resolve(sourceRoot, "app/global-error.css"), "utf-8")).toContain(
      "--muted: #525252;",
    );
  });

  it("routes component-library neutrals through the DubGrid surface system", () => {
    expect(lightThemeCss).toContain("--secondary: var(--dg-color-bg-secondary);");
    expect(lightThemeCss).toContain("--muted: var(--dg-color-bg-secondary);");
    expect(lightThemeCss).toContain("--accent: var(--dg-color-bg-secondary);");
    expect(lightThemeCss).toContain("--border: var(--dg-color-border);");
    expect(lightThemeCss).toContain("--sidebar: var(--dg-color-surface);");

    for (const file of productionUiFiles) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toMatch(/bg-(?:muted|secondary|accent)\/(?:[1-9]\d?)/);
    }
  });

  it("keeps essential small text readable on every standard light surface", () => {
    const standardSurfaces = ["#ffffff", "#fcfcfc", "#eeeeee", "#e5e5e5"];

    for (const surface of standardSurfaces) {
      expect(contrastRatio("#666666", surface)).toBeGreaterThanOrEqual(4.5);
    }

    expect(contrastRatio("#858585", "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("keeps the off switch track visible on every standard light surface", () => {
    const standardSurfaces = ["#ffffff", "#fcfcfc", "#eeeeee", "#e5e5e5"];

    expect(lightThemeCss).toContain("--dg-color-switch-track-off: #828282;");
    expect(globalsCss).toMatch(/\.dark\s*\{[\s\S]*?--dg-color-switch-track-off:\s*#71717a;/);
    for (const surface of standardSurfaces) {
      expect(contrastRatio("#828282", surface)).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio("#828282", "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("does not mutate root-document styles from application code", () => {
    for (const file of productionUiFiles) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toContain("document.documentElement.style");
      expect(source, file).not.toContain("dg-theme-vars");
    }
  });
});
