// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { computePageFingerprint } from "../../../../scripts/documentation/check";
import type {
  AccuracyManifest,
  AccuracyManifestPage,
} from "../../../../scripts/documentation/contract";
import { fingerprintPages, renderManifest } from "../../../../scripts/documentation/fingerprint";
import type { DocumentationSourceInventory } from "../../../../scripts/documentation/inventory";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dubgrid-docs-fingerprint-"));
  roots.push(root);
  write(root, "docs/guide.mdx", "---\ntitle: Guide\ndescription: Guide.\n---\n");
  write(root, "source.ts", "export const value = 1;\n");
  return root;
}

function write(root: string, file: string, contents: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}

const inventory = {
  schemaVersion: 1,
  sourceDigest: "sha256:test",
  webRoutes: [],
  mobileRoutes: [],
  settingsSections: [],
} as unknown as DocumentationSourceInventory;

function page(overrides: Partial<AccuracyManifestPage> = {}): AccuracyManifestPage {
  return {
    id: "guide",
    file: "docs/guide.mdx",
    publicRoute: "/guide",
    deliveryOwner: "40b",
    lifecycle: "published",
    sourceReview: "pending",
    audiences: ["user"],
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
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("docs:fingerprint", () => {
  it("marks a page verified with the fingerprint the check expects, and reruns stably", () => {
    const root = fixture();
    const other = page({ id: "other", file: "docs/other.mdx", publicRoute: "/other" });
    const updated = fingerprintPages(root, manifest([page(), other]), inventory, ["guide"]);
    const guide = updated.pages[0];

    expect(guide.sourceReview).toBe("verified");
    expect(guide.evidenceFingerprint).toBe(computePageFingerprint(root, guide, inventory));
    expect(updated.pages[1]).toEqual(other);

    const again = fingerprintPages(root, updated, inventory, ["guide"]);
    expect(renderManifest(again)).toBe(renderManifest(updated));
  });

  it("records a new fingerprint when the evidence changes", () => {
    const root = fixture();
    const first = fingerprintPages(root, manifest([page()]), inventory, ["guide"]);
    write(root, "source.ts", "export const value = 2;\n");
    const second = fingerprintPages(root, first, inventory, ["guide"]);
    expect(second.pages[0].evidenceFingerprint).not.toBe(first.pages[0].evidenceFingerprint);
  });

  it("refuses unknown, planned, and unevidenced pages and an empty request", () => {
    const root = fixture();
    const planned = page({ id: "later", file: "docs/later.mdx", lifecycle: "planned" });
    const gone = page({
      id: "gone",
      sections: [{ ...page().sections[0], sourceFiles: ["missing.ts", "../outside.ts"] }],
    });
    const all = manifest([planned, gone]);

    expect(() => fingerprintPages(root, all, inventory, [])).toThrow("Name at least one page id");
    expect(() => fingerprintPages(root, all, inventory, ["nope"])).toThrow(
      "Unknown manifest page: nope",
    );
    expect(() => fingerprintPages(root, all, inventory, ["later"])).toThrow(
      "Page later is planned",
    );
    expect(() => fingerprintPages(root, all, inventory, ["gone"])).toThrow(
      "Page gone has missing evidence: missing.ts, ../outside.ts",
    );
  });
});
