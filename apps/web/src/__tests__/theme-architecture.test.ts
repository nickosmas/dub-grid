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
const globalsCss = readFileSync(resolve(sourceRoot, "app/globals.css"), "utf-8");
const globalError = readFileSync(resolve(sourceRoot, "app/global-error.tsx"), "utf-8");
const appShell = readFileSync(resolve(sourceRoot, "components/AppShell.tsx"), "utf-8");
const themePreference = readFileSync(resolve(sourceRoot, "lib/theme-preference.ts"), "utf-8");
const themeSeed = readFileSync(resolve(publicRoot, "dg-theme-seed.js"), "utf-8");

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.(tsx?|jsx?)$/.test(entry) && !entry.includes(".test.") ? [path] : [];
  });
}

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

  it("keeps static auth presentation in authored CSS", () => {
    for (const file of staticAuthRoots.flatMap(sourceFilesUnder)) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toContain("style={{");
      expect(source, file).not.toMatch(/<style(?:\s|>)/);
      expect(source, file).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("does not mutate root-document styles from application code", () => {
    for (const file of sourceFilesUnder(sourceRoot)) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toContain("document.documentElement.style");
      expect(source, file).not.toContain("dg-theme-vars");
    }
  });
});
