import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computePageFingerprint } from "./check";
import { isInsideRepository, loadAccuracyManifest, type AccuracyManifest } from "./contract";
import { generatedInventory } from "./generate";
import type { DocumentationSourceInventory } from "./inventory";

export const ACCURACY_MANIFEST = "internal/documentation/accuracy-manifest.json";

/** Marks the named current pages source-reviewed and records their evidence fingerprints. */
export function fingerprintPages(
  repoRoot: string,
  manifest: AccuracyManifest,
  inventory: DocumentationSourceInventory,
  pageIds: string[],
): AccuracyManifest {
  if (pageIds.length === 0) throw new Error("Name at least one page id to fingerprint.");
  const pages = manifest.pages.map((page) => ({ ...page }));
  for (const id of pageIds) {
    const page = pages.find((candidate) => candidate.id === id);
    if (!page) throw new Error(`Unknown manifest page: ${id}`);
    if (page.lifecycle === "planned") {
      throw new Error(`Page ${id} is planned; publish it before recording its evidence.`);
    }
    const evidence = [
      page.file,
      ...page.sections.flatMap((section) => [...section.sourceFiles, ...section.testFiles]),
    ];
    const missing = evidence.filter(
      (file) => !isInsideRepository(repoRoot, file) || !existsSync(path.join(repoRoot, file)),
    );
    if (missing.length > 0) {
      throw new Error(`Page ${id} has missing evidence: ${missing.join(", ")}`);
    }
    page.sourceReview = "verified";
    delete page.evidenceFingerprint;
    page.evidenceFingerprint = computePageFingerprint(repoRoot, page, inventory);
  }
  return { ...manifest, pages };
}

export function renderManifest(manifest: AccuracyManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] !== "--write") {
    throw new Error("Usage: docs:fingerprint -- --write <page-id> [page-id...]");
  }
  const repoRoot = process.cwd();
  const inventory = JSON.parse(generatedInventory(repoRoot).json) as DocumentationSourceInventory;
  const updated = fingerprintPages(
    repoRoot,
    loadAccuracyManifest(repoRoot),
    inventory,
    args.slice(1),
  );
  writeFileSync(path.join(repoRoot, ACCURACY_MANIFEST), renderManifest(updated));
  process.stdout.write(`Recorded evidence for ${args.slice(1).join(", ")}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
