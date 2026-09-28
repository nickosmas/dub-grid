// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  collectHttpMethods,
  collectEnvironmentKeys,
  collectMigrations,
  collectMobileRoutes,
  collectPackageScripts,
  collectPermissions,
  collectRlsTables,
  collectScheduledJobs,
  collectSettingsSections,
  collectSupportedCommands,
  collectWebRoutes,
  collectWorkspaces,
  discoverEnvironmentKeys,
  inventoryDigest,
} from "../../../../scripts/documentation/inventory";

const fixtureRoots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dubgrid-docs-"));
  fixtureRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents = "export default function Page() {}") {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function migration(root: string, fileName: string, sql: string): string {
  write(root, `supabase/migrations/${fileName}`, sql);
  return `${createHash("sha256").update(sql).digest("hex")}  ${fileName}`;
}

afterEach(() => {
  while (fixtureRoots.length > 0) rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
});

describe("documentation source inventory", () => {
  it("normalizes Next route groups while preserving dynamic parameters", () => {
    const root = fixture();
    write(root, "apps/web/src/app/page.tsx");
    write(root, "apps/web/src/app/(app)/people/[id]/page.tsx");
    write(root, "apps/web/src/app/(public)/articles/[...slug]/page.tsx");

    expect(collectWebRoutes(root)).toEqual([
      {
        id: "web:/",
        path: "/",
        routeGroups: [],
        dynamicParameters: [],
        source: { path: "apps/web/src/app/page.tsx" },
      },
      {
        id: "web:/articles/[...slug]",
        path: "/articles/[...slug]",
        routeGroups: ["public"],
        dynamicParameters: ["slug"],
        source: { path: "apps/web/src/app/(public)/articles/[...slug]/page.tsx" },
      },
      {
        id: "web:/people/[id]",
        path: "/people/[id]",
        routeGroups: ["app"],
        dynamicParameters: ["id"],
        source: { path: "apps/web/src/app/(app)/people/[id]/page.tsx" },
      },
    ]);
  });

  it("rejects web URL collisions hidden by route groups", () => {
    const root = fixture();
    write(root, "apps/web/src/app/(one)/people/page.tsx");
    write(root, "apps/web/src/app/(two)/people/page.tsx");
    expect(() => collectWebRoutes(root)).toThrow("Duplicate web route: web:/people");
  });

  it("classifies Expo screens, layouts, platform files, and catch-all parameters", () => {
    const root = fixture();
    write(root, "apps/mobile/app/(tabs)/_layout.android.tsx");
    write(root, "apps/mobile/app/(tabs)/home/index.tsx");
    write(root, "apps/mobile/app/person/[...id].tsx");
    write(root, "apps/mobile/app/+not-found.tsx");

    const routes = collectMobileRoutes(root);
    expect(routes.map(({ id }) => id)).toEqual([
      "mobile:layout:/(tabs):android",
      "mobile:not-found:/:all",
      "mobile:screen:/(tabs)/home:all",
      "mobile:screen:/person/[...id]:all",
    ]);
    expect(routes.find((route) => route.id.includes("home"))).toMatchObject({
      routerPath: "/(tabs)/home",
      urlPattern: "/home",
    });
    expect(routes.find((route) => route.id.includes("person"))?.dynamicParameters).toEqual(["id"]);
  });

  it("rejects mobile URL collisions hidden by route groups", () => {
    const root = fixture();
    write(root, "apps/mobile/app/(one)/people.tsx");
    write(root, "apps/mobile/app/(two)/people.tsx");
    expect(() => collectMobileRoutes(root)).toThrow("Duplicate mobile screen URL: /people:all");
  });

  it("collects function, constant, and aliased Route Handler exports", () => {
    const root = fixture();
    write(
      root,
      "apps/web/src/app/api/items/route.ts",
      "export async function GET() {}\nexport const POST = async () => {};",
    );
    write(
      root,
      "apps/web/src/app/(app)/auth/callback/handlers.ts",
      "export const handler = () => {};\n",
    );
    write(
      root,
      "apps/web/src/app/(app)/auth/callback/route.ts",
      'export { handler as PATCH } from "./handlers";',
    );

    expect(collectHttpMethods(root)).toEqual([
      {
        id: "http:GET:/api/items",
        method: "GET",
        path: "/api/items",
        scope: "api",
        source: { path: "apps/web/src/app/api/items/route.ts" },
      },
      {
        id: "http:PATCH:/auth/callback",
        method: "PATCH",
        path: "/auth/callback",
        scope: "auth-handler",
        source: { path: "apps/web/src/app/(app)/auth/callback/route.ts" },
        implementationSource: { path: "apps/web/src/app/(app)/auth/callback/handlers.ts" },
      },
      {
        id: "http:POST:/api/items",
        method: "POST",
        path: "/api/items",
        scope: "api",
        source: { path: "apps/web/src/app/api/items/route.ts" },
      },
    ]);
  });

  it("fails closed on wildcard Route Handler exports", () => {
    const root = fixture();
    write(root, "apps/web/src/app/api/items/route.ts", 'export * from "./handlers";');
    expect(() => collectHttpMethods(root)).toThrow(
      "Wildcard Route Handler export is not supported",
    );
  });

  it("cross-checks Settings navigation entries against rendered panels", () => {
    const root = fixture();
    write(
      root,
      "apps/web/src/components/settings/nav-config.tsx",
      `
        export const VALID_SECTIONS = ["org-general", "staff-roles"];
        export function buildNavGroups(perms, overrides) {
          const groups = [];
          const generalItems = [];
          if (perms.isSuperAdmin) generalItems.push({ id: "org-general", label: "Organization Details" });
          groups.push({ id: "general", label: "General", items: generalItems });
          if (perms.canViewOrgLabels) groups.push({
            id: "staff",
            label: "Staff designations",
            items: [{ id: "staff-roles", label: overrides?.roleLabel ?? "Roles" }],
          });
          return groups;
        }
      `,
    );
    write(
      root,
      "apps/web/src/components/settings/SettingsPage.tsx",
      `
        const OrganizationGeneral = dynamic(() => import("./OrganizationGeneral"));
        const StringListSettings = dynamic(() => import("./StringListSettings"));
        export function SettingsPage({ activeSection }) {
          return <>{activeSection === "org-general" && <OrganizationGeneral />}
            {activeSection === "staff-roles" && <StringListSettings />}</>;
        }
      `,
    );
    write(root, "apps/web/src/components/settings/OrganizationGeneral.tsx");
    write(root, "apps/web/src/components/settings/StringListSettings.tsx");

    expect(collectSettingsSections(root)).toEqual([
      expect.objectContaining({
        id: "settings:org-general",
        group: "General",
        defaultLabel: "Organization Details",
        panelSource: {
          path: "apps/web/src/components/settings/OrganizationGeneral.tsx",
        },
      }),
      expect.objectContaining({
        id: "settings:staff-roles",
        group: "Staff designations",
        defaultLabel: "Roles",
        panelSource: { path: "apps/web/src/components/settings/StringListSettings.tsx" },
      }),
    ]);
  });

  it("fails when a Settings section has no render target", () => {
    const root = fixture();
    write(
      root,
      "apps/web/src/components/settings/nav-config.tsx",
      `export const VALID_SECTIONS = ["org-general"];
       export function buildNavGroups() {
         const groups = [];
         groups.push({ id: "general", label: "General", items: [{ id: "org-general", label: "Organization Details" }] });
         return groups;
       }`,
    );
    write(
      root,
      "apps/web/src/components/settings/SettingsPage.tsx",
      "export function SettingsPage() { return null; }",
    );
    expect(() => collectSettingsSections(root)).toThrow(
      "VALID_SECTIONS entry has no rendered panel: org-general",
    );
  });

  it("cross-checks permissions across role defaults, UI modules, and mobile", () => {
    const root = fixture();
    write(
      root,
      "packages/domain/src/permissions.ts",
      `export interface AdminPermissions { canViewSchedule: boolean; canEditShifts: boolean; }`,
    );
    write(
      root,
      "packages/authz/src/index.ts",
      `
        const ALL_PERMS = { canViewSchedule: true, canEditShifts: true };
        export const READ_ONLY_PERMS = { canViewSchedule: true, canEditShifts: false };
        export const ADMIN_DEFAULT_PERMS = { ...READ_ONLY_PERMS, canEditShifts: true };
        export const VIEW_IMPLICATIONS = { canViewSchedule: ["canEditShifts"] };
      `,
    );
    write(
      root,
      "apps/web/src/components/PermissionsEditor.tsx",
      `export const PERMISSION_MODULES = [{ id: "schedule", viewKeys: ["canViewSchedule"], editKeys: ["canEditShifts"] }];`,
    );
    write(
      root,
      "packages/contracts/src/mobile.ts",
      `export const mobilePermissionsSchema = z.object({ canViewSchedule: z.boolean(), canEditShifts: z.boolean() });`,
    );

    expect(collectPermissions(root)).toEqual([
      expect.objectContaining({
        key: "canViewSchedule",
        roleDefaults: { user: true, admin: true, superAdmin: true, gridmaster: true },
        impliedBy: ["canEditShifts"],
        uiModules: ["schedule"],
      }),
      expect.objectContaining({
        key: "canEditShifts",
        roleDefaults: { user: false, admin: true, superAdmin: true, gridmaster: true },
        uiModules: ["schedule"],
      }),
    ]);
  });

  it("expands workspaces and requires command policy entries to name real scripts", () => {
    const root = fixture();
    write(
      root,
      "package.json",
      JSON.stringify({
        name: "root",
        workspaces: ["apps/*", "packages/*"],
        scripts: { test: "vitest", broken: "exit 1" },
      }),
    );
    write(
      root,
      "apps/web/package.json",
      JSON.stringify({
        name: "@fixture/web",
        version: "1.0.0",
        private: true,
        scripts: { test: "vitest" },
      }),
    );
    write(
      root,
      "packages/domain/package.json",
      JSON.stringify({ name: "@fixture/domain", version: "1.0.0", private: true }),
    );
    write(
      root,
      "internal/documentation/source-policy.json",
      JSON.stringify({
        schemaVersion: 1,
        commands: {
          "script:root:test": { audience: "ci", status: "supported" },
          "script:root:broken": {
            audience: "developer",
            status: "deprecated",
            reason: "Fixture",
          },
        },
      }),
    );

    expect(collectWorkspaces(root).map(({ name }) => name)).toEqual([
      "@fixture/domain",
      "@fixture/web",
    ]);
    const scripts = collectPackageScripts(root);
    expect(scripts).toHaveLength(3);
    expect(collectSupportedCommands(root, scripts)).toEqual([
      expect.objectContaining({ id: "command:root:broken", status: "deprecated" }),
      expect.objectContaining({ id: "command:root:test", status: "supported" }),
    ]);

    write(
      root,
      "internal/documentation/source-policy.json",
      JSON.stringify({
        schemaVersion: 1,
        commands: {
          "script:root:missing": { audience: "ci", status: "supported" },
        },
      }),
    );
    expect(() => collectSupportedCommands(root, scripts)).toThrow(
      "Documentation command policy names a missing script",
    );

    write(
      root,
      "internal/documentation/source-policy.json",
      JSON.stringify({
        schemaVersion: 1,
        commands: { "script:root:test": { audience: "ci", status: "supported" } },
      }),
    );
    expect(() => collectSupportedCommands(root, scripts)).toThrow(
      "Unclassified root scripts: script:root:broken",
    );
  });

  it("reuses migration checksums and folds final RLS table state", () => {
    const root = fixture();
    const first = migration(
      root,
      "001_schema.sql",
      `
        CREATE TABLE public.alpha (id bigint);
        ALTER TABLE public.alpha ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN CREATE TABLE public.not_real (id bigint); END $$;
      `,
    );
    const second = migration(
      root,
      "002_rename.sql",
      `
        ALTER TABLE public.alpha RENAME TO beta;
        CREATE TABLE IF NOT EXISTS public.temporary (id bigint);
        ALTER TABLE public.temporary ENABLE ROW LEVEL SECURITY;
        DROP TABLE public.temporary;
      `,
    );
    write(root, "supabase/migrations/checksums.sha256", `${first}\n${second}\n`);

    expect(collectMigrations(root)).toHaveLength(2);
    expect(collectRlsTables(root)).toEqual([
      expect.objectContaining({ id: "rls:public.beta", table: "beta", enabled: true }),
    ]);

    write(
      root,
      "supabase/migrations/checksums.sha256",
      `${"0".repeat(64)}  001_schema.sql\n${second}\n`,
    );
    expect(() => collectMigrations(root)).toThrow("Applied migration changed after checksum lock");
  });

  it("rejects migration gaps and final-state RLS disablement", () => {
    const gapRoot = fixture();
    const first = migration(gapRoot, "001_schema.sql", "CREATE TABLE public.alpha (id bigint);\n");
    const third = migration(gapRoot, "003_gap.sql", "SELECT 1;\n");
    write(gapRoot, "supabase/migrations/checksums.sha256", `${first}\n${third}\n`);
    expect(() => collectMigrations(gapRoot)).toThrow("Migration sequence must be contiguous");

    const rlsRoot = fixture();
    const rls = migration(
      rlsRoot,
      "001_schema.sql",
      `CREATE TABLE public.alpha (id bigint);
       ALTER TABLE public.alpha ENABLE ROW LEVEL SECURITY;
       ALTER TABLE public.alpha DISABLE ROW LEVEL SECURITY;`,
    );
    write(rlsRoot, "supabase/migrations/checksums.sha256", `${rls}\n`);
    expect(() => collectRlsTables(rlsRoot)).toThrow("Public tables without enabled RLS: alpha");
  });

  it("folds ALTER TABLE ONLY and multi-table drops", () => {
    const root = fixture();
    const schema = migration(
      root,
      "001_schema.sql",
      `CREATE TABLE public.alpha (id bigint);
       CREATE TABLE public.beta (id bigint);
       CREATE TABLE public.gamma (id bigint);
       ALTER TABLE ONLY public.alpha ENABLE ROW LEVEL SECURITY;
       ALTER TABLE ONLY public.beta ENABLE ROW LEVEL SECURITY;
       ALTER TABLE public.gamma ENABLE ROW LEVEL SECURITY;
       DROP TABLE IF EXISTS public.beta, public.gamma CASCADE;`,
    );
    write(root, "supabase/migrations/checksums.sha256", `${schema}\n`);
    expect(collectRlsTables(root).map(({ id }) => id)).toEqual(["rls:public.alpha"]);

    const disable = migration(
      root,
      "002_disable.sql",
      "ALTER TABLE ONLY public.alpha DISABLE ROW LEVEL SECURITY;",
    );
    write(root, "supabase/migrations/checksums.sha256", `${schema}\n${disable}\n`);
    expect(() => collectRlsTables(root)).toThrow("Public tables without enabled RLS: alpha");
  });

  it("discovers every environment read form and skips unit tests", () => {
    const root = fixture();
    const read = (name: string) => ["process", `.env.${name}`].join("");
    write(root, "apps/web/sentry.server.config.ts", `export const dsn = ${read("SENTRY_DSN")};`);
    write(root, "apps/web/src/a.ts", `${read("OPT_KEY").replace(".env.", ".env?.")};`);
    write(root, "apps/web/src/b.ts", `const { DES_KEY, other } = ${["process", ".env"].join("")};`);
    write(
      root,
      "scripts/run.mjs",
      "export const port = (env) => env.RUN_PORT ?? env?.RUN_LIMIT ?? env.lowercase;",
    );
    write(
      root,
      "apps/web/src/lib/env.server.ts",
      "const schema = z.object({\n  SCHEMA_KEY: z.string(),\n});",
    );
    write(root, "e2e/helpers/auth.ts", `export const base = ${read("E2E_BASE")};`);
    write(root, "e2e/login.spec.ts", `export const samples = ${read("SPEC_KNOB")};`);
    write(
      root,
      ".github/workflows/ci.yml",
      "env:\n  NODE_VERSION: 22\njobs:\n  a:\n    env:\n      KEY: ${{ secrets.CI_SECRET }}\n      V: ${{ env.NODE_VERSION }}\n",
    );
    write(root, "apps/web/src/__tests__/a.test.ts", `export const only = ${read("TEST_ONLY")};`);
    write(root, ".env.example", "# COMMENTED_KEY=value\n# Not a key: see docs\n");

    const found = discoverEnvironmentKeys(root);
    expect([...found.keys()].sort()).toEqual([
      "CI_SECRET",
      "COMMENTED_KEY",
      "DES_KEY",
      "E2E_BASE",
      "OPT_KEY",
      "RUN_LIMIT",
      "RUN_PORT",
      "SCHEMA_KEY",
      "SENTRY_DSN",
      "SPEC_KNOB",
    ]);
    expect([...found.get("SCHEMA_KEY")!.declarations]).toEqual(["apps/web/src/lib/env.server.ts"]);
    expect([...found.get("COMMENTED_KEY")!.examples]).toEqual([".env.example"]);
  });

  it("classifies environment names without reading values", () => {
    const root = fixture();
    write(root, "apps/web/src/lib/env.ts", "export const site = process.env.NEXT_PUBLIC_SITE_URL;");
    write(root, ".env.example", "NEXT_PUBLIC_SITE_URL=https://example.test\n");
    write(
      root,
      "internal/documentation/source-policy.json",
      JSON.stringify({
        schemaVersion: 1,
        commands: {},
        environment: {
          NEXT_PUBLIC_SITE_URL: { declaration: "required", exposure: "public" },
        },
      }),
    );
    const keys = collectEnvironmentKeys(root);
    expect(keys).toEqual([
      expect.objectContaining({
        id: "env:NEXT_PUBLIC_SITE_URL",
        exposure: "public",
        exampleFiles: [".env.example"],
      }),
    ]);
    expect(JSON.stringify(keys)).not.toContain("example.test");

    write(
      root,
      "apps/web/src/lib/secret.ts",
      ["export const secret = process", ".env.NEW_SECRET;"].join(""),
    );
    expect(() => collectEnvironmentKeys(root)).toThrow("Unclassified environment keys: NEW_SECRET");
  });

  it("collects Vercel and scheduled GitHub jobs", () => {
    const root = fixture();
    write(
      root,
      "apps/web/vercel.json",
      JSON.stringify({ crons: [{ path: "/api/cron/trial-expiry", schedule: "0 14 * * *" }] }),
    );
    write(
      root,
      ".github/workflows/cron-expire-requests.yml",
      `on:
  schedule:
    - cron: "0 * * * *"
jobs: {}`,
    );
    const policy = (scheduledJobs: Record<string, { category: string }>) =>
      write(
        root,
        "internal/documentation/source-policy.json",
        JSON.stringify({ schemaVersion: 1, commands: {}, environment: {}, scheduledJobs }),
      );
    policy({ "schedule:vercel:/api/cron/trial-expiry": { category: "product" } });
    expect(() => collectScheduledJobs(root)).toThrow(
      "Unclassified scheduled jobs: schedule:github:cron-expire-requests:1",
    );
    policy({
      "schedule:github:cron-expire-requests:1": { category: "repository-maintenance" },
      "schedule:vercel:/api/cron/trial-expiry": { category: "product" },
      "schedule:github:removed:1": { category: "product" },
    });
    expect(() => collectScheduledJobs(root)).toThrow(
      "Scheduled job policy contains undiscovered jobs: schedule:github:removed:1",
    );
    policy({
      "schedule:github:cron-expire-requests:1": { category: "repository-maintenance" },
      "schedule:vercel:/api/cron/trial-expiry": { category: "product" },
    });

    expect(collectScheduledJobs(root)).toEqual([
      expect.objectContaining({
        id: "schedule:github:cron-expire-requests:1",
        schedule: "0 * * * *",
        category: "repository-maintenance",
      }),
      expect.objectContaining({
        id: "schedule:vercel:/api/cron/trial-expiry",
        schedule: "0 14 * * *",
      }),
    ]);

    write(
      root,
      ".github/workflows/cron-expire-requests.yml",
      `on:
  schedule:
    - cron: 0 * * * *
jobs: {}`,
    );
    expect(() => collectScheduledJobs(root)).toThrow("Unable to parse scheduled workflow cron");
  });

  it("digests the extracted facts, not the source files behind them", () => {
    const facts = { webRoutes: [{ id: "web:/", source: { path: "app/page.tsx" } }] };
    expect(inventoryDigest(facts)).toBe(inventoryDigest(structuredClone(facts)));
    expect(
      inventoryDigest({ webRoutes: [{ id: "web:/a", source: { path: "app/page.tsx" } }] }),
    ).not.toBe(inventoryDigest(facts));
  });
});
