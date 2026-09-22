import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The authored stylesheet is split by who loads it: globals.css on every route,
 * app-ui.css only inside the (app) group. A public page that reaches for a class
 * defined in app-ui.css renders unstyled, and nothing else would catch it.
 */

const webSource = path.resolve(__dirname, "..");

const PUBLIC_ENTRIES = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/error.tsx",
  "app/not-found.tsx",
  "app/loading.tsx",
  "app/global-error.tsx",
  "app/request-demo/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/cookie-policy/page.tsx",
];

function resolveImport(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(webSource, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(importer), spec);
  else return null;

  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function collectPublicSources(): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    )) {
      const resolved = resolveImport(match[1] ?? match[2], file);
      if (resolved) visit(resolved);
    }
  };
  for (const entry of PUBLIC_ENTRIES) {
    const file = path.join(webSource, entry);
    if (existsSync(file)) visit(file);
  }
  return [...seen];
}

/** Class names a stylesheet defines rules for. Comments name classes too, so
 *  they come out first. */
function definedClasses(css: string): Set<string> {
  const names = new Set<string>();
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of rules.matchAll(/\.(dg-[A-Za-z0-9_-]+|landing-[A-Za-z0-9_-]+)/g)) {
    names.add(match[1]);
  }
  return names;
}

describe("public CSS boundary", () => {
  const globals = readFileSync(path.join(webSource, "app/globals.css"), "utf8");
  const appUi = readFileSync(path.join(webSource, "app/app-ui.css"), "utf8");
  const inGlobals = definedClasses(globals);
  const inAppUi = definedClasses(appUi);

  it("keeps every class a public route uses out of the app-only stylesheet", () => {
    const offenders = new Set<string>();

    for (const file of collectPublicSources()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(dg-[A-Za-z0-9_-]+|landing-[A-Za-z0-9_-]+)/g)) {
        const name = match[1];
        if (inAppUi.has(name) && !inGlobals.has(name)) {
          offenders.add(`${path.relative(webSource, file)} uses .${name}`);
        }
      }
    }

    expect([...offenders].sort()).toEqual([]);
  });

  it("loads the app-only stylesheet from the app layout and nowhere else", () => {
    const appLayout = readFileSync(path.join(webSource, "app/(app)/layout.tsx"), "utf8");
    expect(appLayout).toContain('import "../app-ui.css";');

    const rootLayout = readFileSync(path.join(webSource, "app/layout.tsx"), "utf8");
    expect(rootLayout).toContain('import "./globals.css";');
    expect(rootLayout).not.toContain("app-ui.css");
  });

  /**
   * The split exists to keep app-only CSS off the public routes, and nothing
   * else notices it eroding: a rule added to the wrong file still renders
   * correctly, it just ships to visitors who never use it. The ceiling is a
   * budget, not a law. Raise it deliberately when public CSS genuinely grows,
   * and move the rule when it does not.
   */
  it("keeps the public stylesheet within its budget", () => {
    const PUBLIC_CSS_BUDGET_BYTES = 70 * 1024;
    const bytes = Buffer.byteLength(globals, "utf8");

    expect(
      bytes,
      `globals.css is ${(bytes / 1024).toFixed(1)}KB, over the ` +
        `${PUBLIC_CSS_BUDGET_BYTES / 1024}KB budget for CSS every visitor downloads. ` +
        "Does the new rule belong in app-ui.css?",
    ).toBeLessThanOrEqual(PUBLIC_CSS_BUDGET_BYTES);

    // The split is only worth its complexity while it still holds most of the
    // app's CSS back.
    expect(Buffer.byteLength(appUi, "utf8")).toBeGreaterThan(bytes / 2);
  });

  it("does not split a publicly used class across the two stylesheets", () => {
    // Partially moving a class is worse than moving it: the public page keeps
    // the class, loads half its rules, and renders subtly wrong.
    const publicClasses = new Set<string>();
    for (const file of collectPublicSources()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(dg-[A-Za-z0-9_-]+|landing-[A-Za-z0-9_-]+)/g)) {
        publicClasses.add(match[1]);
      }
    }

    expect([...publicClasses].filter((name) => inAppUi.has(name)).sort()).toEqual([]);
  });
});
