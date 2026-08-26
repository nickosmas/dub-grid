import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\sfrom\s+)?["'`]([^"'`]+)["'`]|import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const browserSupabaseImportPattern = /from\s+["']@\/lib\/supabase["']/;
const browserDatabaseImportPattern = /from\s+["']@\/lib\/db(?:\/[^"']*)?["']/;
const browserSupabaseDbAccessPattern = /\bsupabase\s*\.\s*(?:from|rpc)\s*\(/;
const browserSupabaseAdminPattern = /\bsupabase\s*\.\s*auth\s*\.\s*admin\b/;

const LEGACY_BROWSER_SUPABASE_IMPORT_ALLOWLIST = new Set<string>([
  "apps/web/src/features/account/client/auth.ts",
]);

const LEGACY_BROWSER_DATABASE_IMPORT_ALLOWLIST = new Set<string>();

const LEGACY_UI_DB_ACCESS_ALLOWLIST = new Set<string>();

function collectSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry === "build") {
      continue;
    }

    const entryPath = path.join(root, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entryPath))) {
      files.push(entryPath);
    }
  }

  return files;
}

function readImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const specifiers: string[] = [];

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function toRelative(filePath: string): string {
  return path.relative(repoRoot, filePath);
}

function isUiLayerSourceFile(relativePath: string): boolean {
  return (
    relativePath.startsWith("apps/web/src/app/") ||
    relativePath.startsWith("apps/web/src/components/") ||
    relativePath.startsWith("apps/web/src/hooks/") ||
    (relativePath.startsWith("apps/web/src/features/") &&
      (relativePath.includes("/client/") || /\/use[A-Z][^/]*\.tsx?$/.test(relativePath)))
  );
}

function isIgnoredUiLayerSourceFile(relativePath: string): boolean {
  return (
    relativePath.includes("/__tests__/") ||
    relativePath.endsWith(".test.ts") ||
    relativePath.endsWith(".test.tsx") ||
    relativePath.startsWith("apps/web/src/app/api/") ||
    relativePath.includes("/server/")
  );
}

describe("framework file placement", () => {
  // Next.js only invokes Proxy from the directory holding the app dir —
  // `apps/web/src/`, since this app lives at `src/app`. A copy one level up at
  // `apps/web/proxy.ts` still type-checks and still passes every unit test in
  // `middleware.test.ts`, because those import the module directly. It just
  // never runs on a request. That is how every guard in it — the
  // unauthenticated redirect, subdomain enforcement, org suspension/archival,
  // billing lock, impersonation rewriting, the per-request CSP — sat inert
  // through the whole monorepo layout without one failing check.
  it("lives beside the app directory, where Next.js will actually invoke it", () => {
    expect(existsSync(path.join(repoRoot, "apps/web/src/proxy.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "apps/web/proxy.ts"))).toBe(false);
  });

  // Vercel reads vercel.json from the project's Root Directory, which is
  // `apps/web` (recorded in .vercel/project.json). A copy at the repo root is
  // never opened — and a `crons` block sitting in the unread copy would mean
  // scheduled jobs that simply never fire, with nothing anywhere reporting a
  // failure. Same failure shape as the middleware above: wrong directory, no
  // error, feature silently absent.
  it("keeps vercel.json only in the directory Vercel actually reads", () => {
    expect(existsSync(path.join(repoRoot, "apps/web/vercel.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "vercel.json"))).toBe(false);
  });
});

describe("architecture boundaries", () => {
  it("keeps shared packages platform-neutral and app-independent", () => {
    const packageSourceFiles = collectSourceFiles(path.join(repoRoot, "packages"));
    const violations: string[] = [];

    for (const filePath of packageSourceFiles) {
      for (const specifier of readImportSpecifiers(filePath)) {
        if (
          specifier.startsWith("@/") ||
          specifier.startsWith("next/") ||
          specifier === "expo" ||
          specifier.startsWith("expo-") ||
          specifier === "react-native" ||
          specifier.startsWith("react-native/") ||
          specifier.includes("apps/web") ||
          specifier.includes("apps/mobile") ||
          /^@dubgrid\/[^/]+\/src(?:\/|$)/.test(specifier)
        ) {
          violations.push(`${toRelative(filePath)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("prevents web and mobile apps from importing each other directly", () => {
    const webFiles = collectSourceFiles(path.join(repoRoot, "apps", "web", "src"));
    const mobileFiles = [
      ...collectSourceFiles(path.join(repoRoot, "apps", "mobile", "src")),
      ...collectSourceFiles(path.join(repoRoot, "apps", "mobile", "app")),
    ];
    const violations: string[] = [];

    for (const filePath of webFiles) {
      for (const specifier of readImportSpecifiers(filePath)) {
        if (specifier.includes("apps/mobile")) {
          violations.push(`${toRelative(filePath)} -> ${specifier}`);
        }
      }
    }

    for (const filePath of mobileFiles) {
      for (const specifier of readImportSpecifiers(filePath)) {
        if (specifier.includes("apps/web")) {
          violations.push(`${toRelative(filePath)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("prevents new browser-side Supabase adapters or raw DB calls in web UI layers", () => {
    const uiRoots = [
      path.join(repoRoot, "apps", "web", "src", "app"),
      path.join(repoRoot, "apps", "web", "src", "components"),
      path.join(repoRoot, "apps", "web", "src", "features"),
      path.join(repoRoot, "apps", "web", "src", "hooks"),
    ];
    const violations: string[] = [];

    for (const root of uiRoots) {
      for (const filePath of collectSourceFiles(root)) {
        const relativePath = toRelative(filePath);
        if (!isUiLayerSourceFile(relativePath) || isIgnoredUiLayerSourceFile(relativePath)) {
          continue;
        }

        const source = readFileSync(filePath, "utf8");

        if (
          browserSupabaseImportPattern.test(source) &&
          !LEGACY_BROWSER_SUPABASE_IMPORT_ALLOWLIST.has(relativePath)
        ) {
          violations.push(`${relativePath} imports @/lib/supabase without being migrated`);
        }

        if (
          browserDatabaseImportPattern.test(source) &&
          !LEGACY_BROWSER_DATABASE_IMPORT_ALLOWLIST.has(relativePath)
        ) {
          violations.push(`${relativePath} imports @/lib/db without being migrated`);
        }

        const usesRawDbAccess =
          browserSupabaseDbAccessPattern.test(source) || browserSupabaseAdminPattern.test(source);
        if (usesRawDbAccess && !LEGACY_UI_DB_ACCESS_ALLOWLIST.has(relativePath)) {
          violations.push(`${relativePath} performs raw Supabase DB access in the UI layer`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
