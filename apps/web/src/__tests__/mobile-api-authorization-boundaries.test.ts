import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const routeRoot = path.join(repoRoot, "apps", "web", "src", "app", "api", "mobile", "v1");
const implementationRoot = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "features",
  "mobile",
  "server",
  "routes",
);

const delegatedMobileAuthorization =
  /\b(?:requireMobileAuth|requireMobileSensitiveActionAuth|requireMobileStepUpSession|requireManagementAccessActor|requireManagementRosterActor)\s*\(/;

const INDEPENDENT_ROUTE_IMPLEMENTATIONS: Record<string, string> = {
  "auth-login": "Public credential exchange with organization membership reconciliation.",
  "auth-organization": "Public organization discovery returns no authenticated tenant data.",
  "auth-recovery-request":
    "Public recovery request uses enumeration resistance and layered distributed rate limits.",
  "org-status":
    "Recovery route independently verifies identity, revocation, live role, and membership.",
};

const SERVICE_ACCESS_FILES: Record<string, string> = {
  "apps/web/src/features/mobile/server/auth.ts":
    "Canonical mobile identity, revocation, live membership, organization, and permission guard.",
  "apps/web/src/features/mobile/server/push.ts":
    "Internal notification delivery receives an already-authorized organization and recipient.",
  "apps/web/src/features/mobile/server/routes/auth-login.ts":
    "Public credential exchange verifies credentials and reconciles a live organization membership.",
  "apps/web/src/features/mobile/server/routes/auth-organization.ts":
    "Public organization discovery exposes only bounded workspace metadata.",
  "apps/web/src/features/mobile/server/routes/auth-sign-out.ts":
    "Sign-out revokes only the bearer's own sessions: bulk scopes need sensitive assurance, recovery needs a verified, unrevoked, live user with fresh OTP proof.",
  "apps/web/src/features/mobile/server/routes/org-status.ts":
    "Recovery route performs its own verified-token, revocation, live-role, and membership checks.",
};

function collectFiles(root: string, targetName: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    if (statSync(entryPath).isDirectory()) {
      files.push(...collectFiles(entryPath, targetName));
    } else if (entry === targetName) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    if (statSync(entryPath).isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function implementationName(routePath: string): string | null {
  const source = readFileSync(path.join(repoRoot, routePath), "utf8");
  return source.match(/from\s+["']@\/features\/mobile\/server\/routes\/([^"']+)["']/)?.[1] ?? null;
}

describe("mobile API authorization boundaries", () => {
  const routePaths = collectFiles(routeRoot, "route.ts").map(relativePath);

  it("routes every mobile API entry through a classified server implementation", () => {
    const missingImplementations = routePaths.filter((routePath) => !implementationName(routePath));
    const unguarded = routePaths.filter((routePath) => {
      const name = implementationName(routePath);
      if (!name || name in INDEPENDENT_ROUTE_IMPLEMENTATIONS) return false;
      const source = readFileSync(path.join(implementationRoot, `${name}.ts`), "utf8");
      return !delegatedMobileAuthorization.test(source);
    });

    expect({ missingImplementations, unguarded }).toEqual({
      missingImplementations: [],
      unguarded: [],
    });
  });

  it("keeps independently authorized mobile routes explicit and exact", () => {
    const usedImplementations = new Set(
      routePaths.map(implementationName).filter((name): name is string => Boolean(name)),
    );
    const missing = Object.keys(INDEPENDENT_ROUTE_IMPLEMENTATIONS).filter(
      (name) => !usedImplementations.has(name),
    );
    const stale = Object.keys(INDEPENDENT_ROUTE_IMPLEMENTATIONS).filter((name) => {
      if (!usedImplementations.has(name)) return false;
      return delegatedMobileAuthorization.test(
        readFileSync(path.join(implementationRoot, `${name}.ts`), "utf8"),
      );
    });

    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  it("classifies every direct mobile service-role access path", () => {
    const sourceRoot = path.join(repoRoot, "apps", "web", "src", "features", "mobile");
    const serviceFiles = [...collectSourceFiles(sourceRoot), ...collectSourceFiles(routeRoot)]
      .map(relativePath)
      .filter((filePath) =>
        /from\s+["']@\/lib\/supabase-service["']|\bgetServiceClient\s*\(/.test(
          readFileSync(path.join(repoRoot, filePath), "utf8"),
        ),
      );

    expect(serviceFiles.sort()).toEqual(Object.keys(SERVICE_ACCESS_FILES).sort());
  });

  it("keeps the shared context live and resource lookups tenant-scoped", () => {
    const authSource = readFileSync(
      path.join(repoRoot, "packages", "mobile-api-core", "src", "auth.ts"),
      "utf8",
    );
    const dataSource = readFileSync(
      path.join(repoRoot, "packages", "data-access", "src", "mobile.ts"),
      "utf8",
    );

    expect(authSource).toMatch(/input\.isRevoked\s*\(/);
    expect(authSource).toMatch(/fetchPlatformRole[\s\S]*?platformRole === "gridmaster"/);
    expect(authSource).toMatch(/membership\.organization\.id === currentOrgId/);
    expect(authSource).toMatch(/currentOrg\.archivedAt/);
    expect(dataSource).toMatch(
      /fetchMobileOrganizationMembershipRows[\s\S]*?\.eq\("user_id", userId\)[\s\S]*?\.is\("archived_at", null\)/,
    );
    expect(dataSource).toMatch(
      /fetchMobileEmployeeRowById[\s\S]*?\.eq\("id", employeeId\)[\s\S]*?\.eq\("org_id", orgId\)/,
    );
  });
});
