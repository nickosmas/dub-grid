// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  checkApiClaims,
  checkDocumentedCommands,
  checkDocumentedPaths,
  checkGeneratedArtifacts,
  checkPermissionClaims,
  checkProhibitedPublicInternals,
  checkPublicDocumentation,
  computePageFingerprint,
} from "../../../../scripts/documentation/check";
import {
  validateAccuracyManifest,
  type AccuracyManifest,
  type AccuracyManifestPage,
  type SurfaceExclusion,
} from "../../../../scripts/documentation/contract";
import type { DocumentationSourceInventory } from "../../../../scripts/documentation/inventory";

const fixtureRoots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dubgrid-docs-contract-"));
  fixtureRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function inventory(
  overrides: Partial<DocumentationSourceInventory> = {},
): DocumentationSourceInventory {
  return {
    schemaVersion: 1,
    sourceDigest: "sha256:test",
    webRoutes: [],
    mobileRoutes: [],
    settingsSections: [],
    httpMethods: [],
    permissions: [],
    workspaces: [],
    migrations: [],
    rlsTables: [],
    environmentKeys: [],
    cronJobs: [],
    packageScripts: [],
    supportedCommands: [],
    ...overrides,
  };
}

function page(overrides: Partial<AccuracyManifestPage> = {}): AccuracyManifestPage {
  return {
    id: "guide",
    file: "docs/guide.mdx",
    publicRoute: "/guide",
    deliveryOwner: "40b",
    lifecycle: "published",
    sourceReview: "pending",
    audiences: ["customer"],
    platforms: { web: "required", ios: "not-applicable", android: "not-applicable" },
    surfaceIds: [],
    sections: [
      {
        id: "guide",
        claims: ["fixture"],
        sourceFiles: ["source.ts"],
        testFiles: [],
        runtimeScenarios: [],
        exclusions: [],
      },
    ],
    ...overrides,
  };
}

function manifest(pages: AccuracyManifestPage[]): AccuracyManifest {
  return {
    schemaVersion: 1,
    frozenProductCandidate: "a".repeat(40),
    runtimeProfiles: {},
    pages,
    surfaceExclusions: [],
  };
}

afterEach(() => {
  while (fixtureRoots.length > 0) rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
});

describe("documentation contract", () => {
  it("reports navigation, orphan, frontmatter, local-link, and anchor drift independently", () => {
    const root = fixture();
    write(root, "docs/docs.json", JSON.stringify({ navigation: { pages: ["guide", "missing"] } }));
    write(root, "docs/index.mdx", "---\ntitle: Home\ndescription: Home.\n---\n");
    write(root, "docs/guide.mdx", "# Guide\n[bad](/absent)\n[anchor](#absent)\n");
    write(root, "docs/orphan.mdx", "---\ntitle: Orphan\ndescription: Orphan.\n---\n");
    const rules = checkPublicDocumentation(root, inventory(), manifest([])).map(
      (item) => item.rule,
    );
    expect(rules.sort()).toEqual([
      "frontmatter",
      "local-anchor",
      "local-link",
      "navigation-target",
      "orphan-page",
    ]);
  });

  it("treats a directory as a broken link target instead of reading it", () => {
    const root = fixture();
    write(root, "docs/docs.json", JSON.stringify({ navigation: { pages: ["guide"] } }));
    write(root, "docs/index.mdx", "---\ntitle: Home\ndescription: Home.\n---\n");
    write(root, "docs/features/placeholder.txt", "");
    write(
      root,
      "docs/guide.mdx",
      "---\ntitle: Guide\ndescription: Guide.\n---\n[a](/features)\n[b](/features#x)\n",
    );
    expect(
      checkPublicDocumentation(root, inventory(), manifest([])).map((item) => item.message),
    ).toEqual(["broken local link /features", "broken local link /features#x"]);
  });

  it("rejects missing surface coverage and closes only with no planned or pending pages", () => {
    const root = fixture();
    write(root, "docs/index.mdx", "---\ntitle: Home\ndescription: Home.\n---\n");
    write(root, "source.ts", "export {};\n");
    const source = inventory({
      webRoutes: [
        {
          id: "web:/",
          path: "/",
          routeGroups: [],
          dynamicParameters: [],
          source: { path: "source.ts" },
        },
      ],
    });
    const pending = manifest([
      page({ id: "home", file: "docs/index.mdx", publicRoute: "/", lifecycle: "published" }),
    ]);
    const report = validateAccuracyManifest(root, source, pending, { requireClosed: true });
    expect(report.errors).toContain(
      "accuracy-manifest.json: source surface has no documentation destination or exclusion: web:/",
    );
    expect(report.errors).toContain(
      "accuracy-manifest.json: contract is not closed (0 planned, 1 pending)",
    );
  });

  it("rejects unknown lifecycle, review, owner and reason values", () => {
    const root = fixture();
    write(root, "docs/index.mdx", "");
    write(root, "source.ts", "export {};\n");
    const invalid = manifest([
      page({
        id: "home",
        file: "docs/index.mdx",
        publicRoute: "/",
        lifecycle: "archived" as AccuracyManifestPage["lifecycle"],
        sourceReview: "done" as AccuracyManifestPage["sourceReview"],
        deliveryOwner: "41" as AccuracyManifestPage["deliveryOwner"],
      }),
      page({ id: "later", lifecycle: "planned", sourceReview: "verified" }),
    ]);
    invalid.surfaceExclusions = [
      {
        surfaceId: "web:/",
        reasonCode: "private" as SurfaceExclusion["reasonCode"],
        rationale: "Fixture",
        sourceFiles: [],
      },
    ];
    const source = inventory({
      webRoutes: [
        {
          id: "web:/",
          path: "/",
          routeGroups: [],
          dynamicParameters: [],
          source: { path: "source.ts" },
        },
      ],
    });
    const { errors } = validateAccuracyManifest(root, source, invalid, { requireClosed: true });
    expect(errors).toEqual(
      expect.arrayContaining([
        "accuracy-manifest.json: home has unknown lifecycle archived",
        "accuracy-manifest.json: home has unknown sourceReview done",
        "accuracy-manifest.json: home has unknown deliveryOwner 41",
        "accuracy-manifest.json: planned page later cannot be verified",
        "accuracy-manifest.json: exclusion web:/ has unknown reasonCode private",
        "accuracy-manifest.json: home must be verified to close the contract",
      ]),
    );
  });

  it("closes a contract whose every current page is verified", () => {
    const root = fixture();
    write(root, "docs/index.mdx", "---\ntitle: Home\ndescription: Home.\n---\n");
    write(root, "source.ts", "export {};\n");
    const home = page({
      id: "home",
      file: "docs/index.mdx",
      publicRoute: "/",
      sourceReview: "verified",
    });
    home.evidenceFingerprint = computePageFingerprint(root, home, inventory());
    const report = validateAccuracyManifest(root, inventory(), manifest([home]), {
      requireClosed: true,
    });
    expect(report.errors).toEqual([]);
    expect(report.counts).toMatchObject({ verified: 1, pending: 0, planned: 0 });
  });

  it("rejects overlapping coverage, mismatched routes, duplicates and outside paths", () => {
    const root = fixture();
    write(root, "docs/guide.mdx", "");
    write(root, "docs/orphan.mdx", "");
    write(root, "source.ts", "export {};\n");
    const route = {
      id: "web:/a",
      path: "/a",
      routeGroups: [],
      dynamicParameters: [],
      source: { path: "source.ts" },
    };
    const guide = page({ publicRoute: "/wrong", surfaceIds: ["web:/a"] });
    const outside = page({
      id: "guide",
      file: "../outside.mdx",
      publicRoute: "/wrong",
      lifecycle: "planned",
      sections: [{ ...guide.sections[0], sourceFiles: ["../../etc/hosts"] }],
    });
    const overlapping = manifest([guide, outside]);
    overlapping.surfaceExclusions = [
      { surfaceId: "web:/a", reasonCode: "internal-only", rationale: "Fixture", sourceFiles: [] },
    ];
    const { errors } = validateAccuracyManifest(
      root,
      inventory({ webRoutes: [route] }),
      overlapping,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "accuracy-manifest.json: web:/a is both excluded and documented",
        "accuracy-manifest.json: guide publicRoute /wrong does not match docs/guide.mdx",
        "accuracy-manifest.json: duplicate page id guide",
        "accuracy-manifest.json: duplicate public route /wrong",
        "accuracy-manifest.json: guide file is outside the repository: ../outside.mdx",
        "accuracy-manifest.json: guide evidence file is outside the repository: ../../etc/hosts",
        "accuracy-manifest.json: current public page is not registered: docs/orphan.mdx",
      ]),
    );
  });

  it("reports unknown surfaces, missing rationale, fingerprints and files exactly", () => {
    const root = fixture();
    write(root, "docs/.keep", "");
    write(root, "source.ts", "export {};\n");
    const unverifiable = page({
      id: "gone",
      file: "docs/gone.mdx",
      publicRoute: "/gone",
      sourceReview: "verified",
      surfaceIds: ["web:/nowhere"],
    });
    const exact = manifest([unverifiable]);
    exact.surfaceExclusions = [
      { surfaceId: "web:/nowhere", reasonCode: "internal-only", rationale: " ", sourceFiles: [] },
    ];
    expect(validateAccuracyManifest(root, inventory(), exact).errors).toEqual([
      "accuracy-manifest.json: exclusion references unknown surface web:/nowhere",
      "accuracy-manifest.json: exclusion web:/nowhere needs a rationale",
      "accuracy-manifest.json: gone file does not exist: docs/gone.mdx",
      "accuracy-manifest.json: gone references unknown surface web:/nowhere",
      "accuracy-manifest.json: registered current page does not exist: docs/gone.mdx",
      "accuracy-manifest.json: verified page gone has no evidence fingerprint",
      "accuracy-manifest.json: web:/nowhere is both excluded and documented",
    ]);
  });

  it("follows nested navigation groups", () => {
    const root = fixture();
    write(
      root,
      "docs/docs.json",
      JSON.stringify({
        navigation: {
          tabs: [{ groups: [{ pages: ["guide", { group: "More", pages: ["deep/page"] }] }] }],
        },
      }),
    );
    write(root, "docs/index.mdx", "---\ntitle: Home\ndescription: Home.\n---\n");
    write(root, "docs/guide.mdx", "---\ntitle: Guide\ndescription: Guide.\n---\n");
    write(root, "docs/deep/page.mdx", "---\ntitle: Deep\ndescription: Deep.\n---\n");
    expect(checkPublicDocumentation(root, inventory(), manifest([]))).toEqual([]);
  });

  it("reports a verified page with missing evidence instead of crashing", () => {
    const root = fixture();
    write(root, "docs/docs.json", JSON.stringify({ navigation: { pages: ["guide"] } }));
    write(root, "docs/guide.mdx", "---\ntitle: Guide\ndescription: Guide.\n---\n");
    write(root, "source.ts", "export const value = 1;\n");
    const verified = page({ sourceReview: "verified" });
    verified.evidenceFingerprint = computePageFingerprint(root, verified, inventory());
    write(root, "source.ts", "export const value = 2;\n");
    expect(
      checkPublicDocumentation(root, inventory(), manifest([verified])).map((item) => item.rule),
    ).toEqual(["evidence-fingerprint"]);

    rmSync(path.join(root, "source.ts"));
    expect(checkPublicDocumentation(root, inventory(), manifest([verified]))).toEqual([]);
    expect(validateAccuracyManifest(root, inventory(), manifest([verified])).errors).toContain(
      "accuracy-manifest.json: guide references missing evidence file source.ts",
    );
  });

  it("rejects unknown and unsupported documented commands", () => {
    const source = inventory({
      supportedCommands: [
        {
          id: "command:root:lint:rules",
          scriptId: "script:root:lint:rules",
          invocation: "npm run lint:rules",
          audience: "developer",
          status: "deprecated",
        },
      ],
    });
    expect(checkDocumentedCommands("guide.mdx", "npm run missing", source)).toHaveLength(1);
    expect(checkDocumentedCommands("guide.mdx", "npm run lint:rules", source)).toHaveLength(1);
  });

  it("rejects nonexistent application and repository paths", () => {
    const root = fixture();
    const result = checkDocumentedPaths(
      root,
      "guide.mdx",
      "Open `/staff` and edit `missing/file.ts`.",
      inventory(),
    );
    expect(result.map((item) => item.rule)).toEqual(["documented-path", "documented-path"]);
  });

  it("rejects API route-method drift", () => {
    expect(checkApiClaims("guide.mdx", "| `/api/example` | `POST` |", inventory())).toEqual([
      expect.objectContaining({ rule: "api-method" }),
    ]);
  });

  it("rejects permission drift", () => {
    expect(checkPermissionClaims("guide.mdx", "Requires `canTeleport`.", inventory())).toEqual([
      expect.objectContaining({ rule: "permission" }),
    ]);
  });

  it("rejects prohibited public internals", () => {
    const result = checkProhibitedPublicInternals(
      "guide.mdx",
      "Use `/gridmaster`, Test Sandbox, feature flags, process.env, and `/api/private`.",
    );
    expect(result).toHaveLength(5);
    expect(result.every((item) => item.rule === "public-internals")).toBe(true);
  });

  it("detects stale generated artifacts without rewriting them", () => {
    const root = fixture();
    write(root, "internal/documentation/generated/app-inventory.json", "old-json\n");
    write(root, "internal/documentation/generated/app-inventory.md", "old-markdown\n");
    const result = checkGeneratedArtifacts(root, {
      json: "new-json\n",
      markdown: "new-markdown\n",
    });
    expect(result.map((item) => item.file)).toEqual([
      "internal/documentation/generated/app-inventory.json",
      "internal/documentation/generated/app-inventory.md",
    ]);
  });

  it("changes a page fingerprint when its source evidence changes", () => {
    const root = fixture();
    write(root, "docs/guide.mdx", "---\ntitle: Guide\ndescription: Guide.\n---\n");
    write(root, "source.ts", "export const value = 1;\n");
    const first = computePageFingerprint(root, page(), inventory());
    write(root, "source.ts", "export const value = 2;\n");
    expect(computePageFingerprint(root, page(), inventory())).not.toBe(first);
  });
});
