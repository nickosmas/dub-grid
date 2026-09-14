import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export const DEFAULT_PRODUCTION_PROJECT_REF = "xpoylacxkbphnudsupuu";

export interface MigrationFile {
  version: string;
  name: string;
  file: string;
  sha256: string;
}

export interface LedgerEntry {
  version: string;
  name: string | null;
}

export interface LedgerComparison {
  missingRemote: MigrationFile[];
  unexpectedRemote: LedgerEntry[];
  mismatchedNames: Array<{
    version: string;
    local: string;
    remote: string;
  }>;
  isForwardSuffix: boolean;
}

const MIGRATION_NAME = /^(\d{3})_([a-z0-9_]+)\.sql$/;

export function projectRefFromUrl(value: string): string {
  const url = new URL(value);
  const [ref, host, tld] = url.hostname.split(".");
  if (!ref || host !== "supabase" || tld !== "co") {
    throw new Error("Expected a hosted Supabase project URL.");
  }
  return ref;
}

export function protectedProductionRefs(envValue?: string): Set<string> {
  return new Set(
    (envValue ?? DEFAULT_PRODUCTION_PROJECT_REF)
      .split(",")
      .map((ref) => ref.trim())
      .filter(Boolean),
  );
}

export function loadMigrationInventory(directory: string): MigrationFile[] {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const parsed = files.map((file) => {
    const match = MIGRATION_NAME.exec(file);
    if (!match) {
      throw new Error(`Migration filename is not NNN_snake_case.sql: ${file}`);
    }
    const sql = readFileSync(join(directory, file), "utf8");
    return {
      version: match[1],
      name: match[2],
      file,
      sha256: createHash("sha256").update(sql).digest("hex"),
    };
  });

  if (parsed.length === 0) throw new Error("No numbered migrations found.");

  parsed.forEach((migration, index) => {
    const expected = String(index + 1).padStart(3, "0");
    if (migration.version !== expected) {
      throw new Error(
        `Migration sequence must be contiguous: expected ${expected}, found ${migration.version}.`,
      );
    }
  });

  return parsed;
}

export function assertLegacyPatchManifest(
  patchesDirectory: string,
  manifestPath: string,
): string[] {
  const patches = readdirSync(patchesDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const manifest = readFileSync(manifestPath, "utf8");
  const missing = patches.filter((patch) => !manifest.includes(`\`${patch}\``));
  if (missing.length > 0) {
    throw new Error(`Legacy patch manifest is missing: ${missing.join(", ")}.`);
  }
  return patches;
}

export function assertMigrationChecksumManifest(
  inventory: readonly MigrationFile[],
  manifestPath: string,
): void {
  const lines = readFileSync(manifestPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const recorded = new Map<string, string>();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s{2}([0-9]{3}_[a-z0-9_]+\.sql)$/.exec(line);
    if (!match) throw new Error(`Invalid migration checksum line: ${line}`);
    if (recorded.has(match[2])) throw new Error(`Duplicate migration checksum: ${match[2]}`);
    recorded.set(match[2], match[1]);
  }

  const inventoryNames = new Set(inventory.map((migration) => migration.file));
  const unexpected = [...recorded.keys()].filter((file) => !inventoryNames.has(file));
  if (unexpected.length > 0) {
    throw new Error(`Checksum manifest contains unknown migrations: ${unexpected.join(", ")}.`);
  }
  for (const migration of inventory) {
    const expected = recorded.get(migration.file);
    if (!expected) throw new Error(`Checksum manifest is missing ${migration.file}.`);
    if (expected !== migration.sha256) {
      throw new Error(`Applied migration changed after checksum lock: ${migration.file}.`);
    }
  }
}

export function compareMigrationLedger(
  local: readonly MigrationFile[],
  remote: readonly LedgerEntry[],
): LedgerComparison {
  const localByVersion = new Map(local.map((migration) => [migration.version, migration]));
  const remoteByVersion = new Map(remote.map((migration) => [migration.version, migration]));
  const missingRemote = local.filter((migration) => !remoteByVersion.has(migration.version));
  const unexpectedRemote = remote.filter((migration) => !localByVersion.has(migration.version));
  const mismatchedNames = remote.flatMap((migration) => {
    const expected = localByVersion.get(migration.version);
    if (!expected || !migration.name || expected.name === migration.name) return [];
    return [{ version: migration.version, local: expected.name, remote: migration.name }];
  });

  const firstMissingIndex = local.findIndex((migration) => !remoteByVersion.has(migration.version));
  const presentAfterGap =
    firstMissingIndex >= 0 &&
    local.slice(firstMissingIndex + 1).some((migration) => remoteByVersion.has(migration.version));

  return {
    missingRemote,
    unexpectedRemote,
    mismatchedNames,
    isForwardSuffix:
      unexpectedRemote.length === 0 && mismatchedNames.length === 0 && !presentAfterGap,
  };
}

export function assertSafeForwardLedger(comparison: LedgerComparison): void {
  if (comparison.unexpectedRemote.length > 0) {
    throw new Error(
      `Remote ledger contains unknown versions: ${comparison.unexpectedRemote
        .map((entry) => entry.version)
        .join(", ")}.`,
    );
  }
  if (comparison.mismatchedNames.length > 0) {
    throw new Error(
      `Remote migration names disagree at: ${comparison.mismatchedNames
        .map((entry) => entry.version)
        .join(", ")}.`,
    );
  }
  if (!comparison.isForwardSuffix) {
    throw new Error("Remote ledger has a gap; do not apply migrations until it is reconciled.");
  }
}

export function migrationDirectory(repoRoot: string): string {
  return join(repoRoot, "supabase", "migrations");
}

export function migrationLabel(migration: Pick<MigrationFile, "file" | "sha256">): string {
  return `${basename(migration.file)} ${migration.sha256.slice(0, 12)}`;
}
