import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertLegacyPatchManifest,
  assertMigrationChecksumManifest,
  loadMigrationInventory,
  migrationDirectory,
  migrationLabel,
  protectedProductionRefs,
} from "./lib/migration-readiness";

function readOptional(path: string): string | null {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  return value.length > 0 ? value : null;
}

function main(): void {
  const repoRoot = resolve(import.meta.dirname, "..");
  const inventory = loadMigrationInventory(migrationDirectory(repoRoot));
  assertMigrationChecksumManifest(
    inventory,
    resolve(repoRoot, "supabase/migrations/checksums.sha256"),
  );
  const patches = assertLegacyPatchManifest(
    resolve(repoRoot, "supabase/patches"),
    resolve(repoRoot, "supabase/patches/README.md"),
  );
  const linkedRef = readOptional(resolve(repoRoot, "supabase/.temp/project-ref"));
  const protectedRefs = protectedProductionRefs(process.env.PRODUCTION_PROJECT_REFS);

  console.log(`Migration inventory: ${inventory.length} contiguous files`);
  for (const migration of inventory) console.log(`  ${migrationLabel(migration)}`);
  console.log(`Legacy patch evidence: ${patches.length} documented files`);

  if (!linkedRef) {
    console.log("Linked project: none (no remote command is safe until the target is explicit)");
    return;
  }

  const classification = protectedRefs.has(linkedRef) ? "PROTECTED PRODUCTION" : "non-production";
  console.log(`Linked project: ${linkedRef} (${classification})`);
  if (protectedRefs.has(linkedRef)) {
    console.log(
      "Safety boundary: read-only inspection only; reset, seed, and apply are blocked by policy",
    );
  }
}

main();
