import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The header logo used to shift horizontally between routes because every page
 * invented its own left padding and Header.tsx compensated with a per-route
 * ternary. There is now exactly one canonical gutter, `--dg-page-gutter`
 * (globals.css), and these tests keep it that way.
 */

const webSrc = existsSync(path.resolve(process.cwd(), "apps/web/src"))
  ? path.resolve(process.cwd(), "apps/web/src")
  : path.resolve(process.cwd(), "src");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".css"]);

/** Retired bespoke gutters — each one is a page drifting off the shared token. */
const RETIRED_GUTTERS = ["clamp(16px, 3vw, 40px)", "lg:px-12"];

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry === "build") {
      continue;
    }

    const entryPath = path.join(root, entry);

    if (statSync(entryPath).isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entryPath))) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRelative(filePath: string): string {
  return path.relative(webSrc, filePath);
}

describe("canonical page gutter", () => {
  it("defines --dg-page-gutter exactly once", () => {
    const globals = readFileSync(path.join(webSrc, "app", "globals.css"), "utf8");
    const definitions = globals.match(/--dg-page-gutter\s*:/g) ?? [];

    expect(definitions).toHaveLength(1);
  });

  it("keeps the header bars on the shared gutter", () => {
    const header = readFileSync(path.join(webSrc, "components", "Header.tsx"), "utf8");

    // Desktop paddingLeft + paddingRight, and the mobile bar's shorthand.
    expect(header.match(/var\(--dg-page-gutter\)/g) ?? []).toHaveLength(3);
  });

  it("hides the desktop header at the mobile breakpoint before media-query hydration", () => {
    const header = readFileSync(path.join(webSrc, "components", "Header.tsx"), "utf8");
    const globals = readFileSync(path.join(webSrc, "app", "globals.css"), "utf8");

    expect(header).toContain('className="dg-app-header-desktop"');
    expect(globals).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.dg-app-header-desktop\s*\{\s*display:\s*none !important;/,
    );
  });

  it("never derives header padding from the current route", () => {
    const header = readFileSync(path.join(webSrc, "components", "Header.tsx"), "utf8");

    // Identifiers computed from `pathname` (the old `isFlatPaddingRoute` /
    // `hasSidebarChrome` route flags were declared this way). Padding must not
    // depend on any of them, whatever a future flag ends up being called.
    // `[^;]` already spans newlines, so multi-line declarations are covered.
    const routeFlags = [...header.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*?);/g)]
      .filter(([, , initializer]) => /\bpathname\b/.test(initializer))
      .map(([, identifier]) => identifier);

    const violations = header
      .split("\n")
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(
        ({ line }) =>
          /padding(?:Left|Right)?\s*:/.test(line) &&
          (/\bpathname\b/.test(line) ||
            routeFlags.some((flag) => new RegExp(`\\b${flag}\\b`).test(line))),
      )
      .map(({ line, lineNumber }) => `Header.tsx:${lineNumber} ${line}`);

    expect(violations).toEqual([]);
  });

  it("does not reintroduce retired per-page gutters", () => {
    const violations: string[] = [];

    for (const filePath of collectSourceFiles(webSrc)) {
      const relativePath = toRelative(filePath);
      if (relativePath.startsWith("__tests__/")) continue;

      const source = readFileSync(filePath, "utf8");
      for (const gutter of RETIRED_GUTTERS) {
        if (source.includes(gutter)) {
          violations.push(`${relativePath} -> ${gutter}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
